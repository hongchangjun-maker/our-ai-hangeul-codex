import { Extension } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
    lineHeight: {
      setLineHeight: (height: string) => ReturnType;
    };
  }
}

export const FontSize = Extension.create({
  name: 'fontSize',
  addGlobalAttributes() {
    return [{
      types: ['textStyle'],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (element) => element.style.fontSize?.replace(/['"]+/g, '') || null,
          renderHTML: (attributes) => attributes.fontSize ? { style: `font-size: ${attributes.fontSize}` } : {},
        },
        letterSpacing: {
          default: null,
          parseHTML: (element) => element.style.letterSpacing || null,
          renderHTML: (attributes) => attributes.letterSpacing ? { style: `letter-spacing: ${attributes.letterSpacing}` } : {},
        },
        fontStretch: {
          default: null,
          parseHTML: (element) => element.style.fontStretch || null,
          renderHTML: (attributes) => attributes.fontStretch ? { style: `font-stretch: ${attributes.fontStretch}` } : {},
        },
        baselineShift: {
          default: null,
          parseHTML: (element) => element.style.top || null,
          renderHTML: (attributes) => attributes.baselineShift ? { style: `position: relative; top: -${attributes.baselineShift}` } : {},
        },
        verticalAlign: {
          default: null,
          parseHTML: (element) => element.style.verticalAlign || null,
          renderHTML: (attributes) => attributes.verticalAlign ? { style: `vertical-align: ${attributes.verticalAlign}` } : {},
        },
      },
    }];
  },
  addCommands() {
    return {
      setFontSize: (fontSize) => ({ chain }) => chain().setMark('textStyle', { fontSize }).run(),
      unsetFontSize: () => ({ chain }) => chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

export const LineHeight = Extension.create({
  name: 'lineHeight',
  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading'],
      attributes: {
        lineHeight: {
          default: null,
          parseHTML: (element) => element.style.lineHeight || null,
          renderHTML: (attributes) => attributes.lineHeight ? { style: `line-height: ${attributes.lineHeight}` } : {},
        },
        spaceBeforePx: {
          default: null,
          parseHTML: (element) => element.style.marginTop ? Number(element.style.marginTop.replace('px', '')) : null,
          renderHTML: (attributes) => Number.isFinite(attributes.spaceBeforePx) ? { style: `margin-top: ${attributes.spaceBeforePx}px` } : {},
        },
        spaceAfterPx: {
          default: null,
          parseHTML: (element) => element.style.marginBottom ? Number(element.style.marginBottom.replace('px', '')) : null,
          renderHTML: (attributes) => Number.isFinite(attributes.spaceAfterPx) ? { style: `margin-bottom: ${attributes.spaceAfterPx}px` } : {},
        },
        marginLeftPx: {
          default: null,
          parseHTML: (element) => element.style.marginLeft ? Number(element.style.marginLeft.replace('px', '')) : null,
          renderHTML: (attributes) => Number.isFinite(attributes.marginLeftPx) ? { style: `margin-left: ${attributes.marginLeftPx}px` } : {},
        },
        marginRightPx: {
          default: null,
          parseHTML: (element) => element.style.marginRight ? Number(element.style.marginRight.replace('px', '')) : null,
          renderHTML: (attributes) => Number.isFinite(attributes.marginRightPx) ? { style: `margin-right: ${attributes.marginRightPx}px` } : {},
        },
        textIndentPx: {
          default: null,
          parseHTML: (element) => element.style.textIndent ? Number(element.style.textIndent.replace('px', '')) : null,
          renderHTML: (attributes) => Number.isFinite(attributes.textIndentPx) ? { style: `text-indent: ${attributes.textIndentPx}px` } : {},
        },
      },
    }];
  },
  addCommands() {
    return {
      setLineHeight: (lineHeight) => ({ commands, editor }) => {
        const type = editor.isActive('heading') ? 'heading' : 'paragraph';
        return commands.updateAttributes(type, { lineHeight });
      },
    };
  },
});
