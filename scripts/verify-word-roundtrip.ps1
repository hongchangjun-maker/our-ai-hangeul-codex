param([string]$OutputRoot = '')

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutputRoot) { $OutputRoot = Join-Path $projectRoot ("tmp\word-roundtrip\" + (Get-Date -Format 'yyyyMMdd-HHmmss')) }
$output = [IO.Path]::GetFullPath($OutputRoot)
New-Item -ItemType Directory -Force -Path $output | Out-Null
$source = Join-Path $output 'source.docx'
$resaved = Join-Path $output 'word-resaved.docx'
$pdf = Join-Path $output 'word-resaved.pdf'

& node (Join-Path $PSScriptRoot 'create-roundtrip-fixture.mjs') $source
if ($LASTEXITCODE -ne 0) { throw 'Could not create the app DOCX round-trip fixture.' }
& node (Join-Path $PSScriptRoot 'audit-docx-native.mjs') $source (Join-Path $output 'source-audit.json')
if ($LASTEXITCODE -ne 0) { throw 'The generated DOCX is missing native Word structures.' }

$word = $null
$document = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  Write-Output 'Opening the generated DOCX in Microsoft Word...'
  $document = $word.Documents.Open($source, $false, $false, $false)
  Write-Output 'Word opened the generated DOCX.'
  Write-Output 'Saving the document through Microsoft Word...'
  $document.SaveAs2($resaved, 16)
  Write-Output 'Exporting the Word-resaved document to PDF...'
  $document.ExportAsFixedFormat($pdf, 17)
  $pageCount = $document.ComputeStatistics(2)
} finally {
  if ($document) { $document.Close($false) }
  if ($word) { $word.Quit() }
  if ($document) { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($document) | Out-Null }
  if ($word) { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($word) | Out-Null }
}

& node (Join-Path $PSScriptRoot 'audit-docx-native.mjs') $resaved (Join-Path $output 'word-resaved-audit.json')
if ($LASTEXITCODE -ne 0) { throw 'Word did not preserve one or more native table, image anchor, or text-box structures.' }
@{ passed = $true; pageCount = $pageCount; source = $source; resaved = $resaved; pdf = $pdf } | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $output 'roundtrip-report.json')
Write-Output "Word round-trip verification passed: $output"
