export const CODE_BLOCK_REGEX = /^```([\w-]+)?\s*$/;

export const Block = {
  UNSTYLED: "unstyled",
  PARAGRAPH: "unstyled",
  OL: "ordered-list-item",
  UL: "unordered-list-item",
  H1: "header-one",
  H2: "header-two",
  CODEBLOCK: "code-block",
  BLOCKQUOTE: "blockquote",
};

export const Inline = {
  BOLD: "BOLD",
  CODE: "CODE",
  ITALIC: "ITALIC",
  STRIKETHROUGH: "STRIKETHROUGH",
  UNDERLINE: "UNDERLINE",
};
