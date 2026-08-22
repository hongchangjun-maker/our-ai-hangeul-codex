import OpenAI from 'openai';
import { getModels, getOpenAIKey, getRuntimeSettings, type RuntimeSettings } from './settings';

const ACTION_PROMPTS: Record<string, string> = {
  polish: '선택한 한국어 문장을 의미를 바꾸지 말고 더 자연스럽고 명확하게 다듬으세요.',
  shorten: '핵심 의미와 중요한 사실을 보존하면서 더 짧고 간결하게 고치세요.',
  expand: '원문에 없는 사실을 만들어내지 말고, 논리적 연결과 설명을 보강해 더 자세하게 작성하세요.',
  proofread: '맞춤법, 띄어쓰기, 문법을 교정하세요. 숫자와 고유명사는 임의로 바꾸지 마세요.',
  official: '한국 공공기관 문서에 어울리는 명확하고 정중한 공문체로 고치세요.',
  report: '핵심 결론이 잘 드러나는 전문적인 보고서 문체로 고치세요.',
  summarize: '문서의 핵심 사실, 결정사항, 일정과 요청사항을 빠짐없이 간결하게 요약하세요.',
  continue: '앞 문맥과 문체를 유지해 자연스럽게 이어 쓰세요. 확인되지 않은 사실은 만들지 마세요.',
  ask: '사용자의 지시를 따르되 원문에 없는 사실을 단정하지 말고, 문서에 바로 검토해 넣을 수 있는 한국어 초안을 작성하세요.',
};

function routedModel(action: string, settings: RuntimeSettings) {
  if (!settings.autoRouting) return settings.model;
  if (['proofread', 'shorten'].includes(action)) return 'gpt-5.6-luna';
  if (['polish', 'expand', 'official', 'report', 'summarize', 'continue'].includes(action)) return 'gpt-5.6-terra';
  return settings.model;
}

export async function runDocumentAI(input: { action: string; content: string; instruction?: string }) {
  const key = await getOpenAIKey();
  if (!key) throw Object.assign(new Error('OpenAI가 연결되지 않았습니다.'), { code: 'OPENAI_NOT_CONNECTED', status: 503 });
  const settings = await getRuntimeSettings();
  const enabled = await getModels();
  const requestedModel = routedModel(input.action, settings);
  const model = enabled.some((candidate) => candidate.id === requestedModel && Boolean(candidate.enabled)) ? requestedModel : settings.model;
  if (!enabled.some((candidate) => candidate.id === model && Boolean(candidate.enabled))) throw Object.assign(new Error('선택한 모델이 비활성화되어 있습니다.'), { code: 'MODEL_NOT_ENABLED', status: 409 });
  const client = new OpenAI({ apiKey: key });
  const task = ACTION_PROMPTS[input.action] || ACTION_PROMPTS.ask;
  const instruction = input.instruction?.trim() ? `\n사용자 추가 지시: ${input.instruction.trim()}` : '';
  const response = await client.responses.create({
    model,
    store: false,
    reasoning: { effort: settings.reasoning },
    max_output_tokens: settings.maxOutputTokens,
    instructions: '당신은 한국어 문서 편집 도우미입니다. 사용자 문서의 의미와 사실을 보존하고, 결과만 한국어로 반환하세요. 사용자의 명시적 지시 없이 문서 내용을 삭제하거나 법률·의료·재무 사실을 보장하지 마세요. HTML이나 JavaScript 코드를 생성하지 마세요.',
    input: `${task}${instruction}\n\n[원문]\n${input.content}`,
  }, { signal: AbortSignal.timeout(45_000) });
  const output = response.output_text?.trim();
  if (!output) throw Object.assign(new Error('OpenAI가 빈 결과를 반환했습니다.'), { code: 'OPENAI_EMPTY_RESPONSE', status: 502 });
  return { output, model, usage: { inputTokens: response.usage?.input_tokens ?? 0, outputTokens: response.usage?.output_tokens ?? 0 } };
}

export async function testOpenAI(apiKey: string, model: string) {
  const client = new OpenAI({ apiKey });
  const response = await client.responses.create({ model, store: false, reasoning: { effort: 'none' }, max_output_tokens: 12, input: '연결 확인이라고만 답하세요.' }, { signal: AbortSignal.timeout(20_000) });
  if (!response.output_text?.trim()) throw new Error('OpenAI가 빈 응답을 반환했습니다.');
  return true;
}
