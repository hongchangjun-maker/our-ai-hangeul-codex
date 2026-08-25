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
