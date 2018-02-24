import React from "react";
import {
  blockRenderMap as checkboxBlockRenderMap,
  CheckableListItem,
  CheckableListItemUtils,
  CHECKABLE_LIST_ITEM,
} from "draft-js-checkable-list-item";

import { Map } from "immutable";
import { RichUtils } from "draft-js";

import adjustBlockDepth from "./modifiers/adjustBlockDepth";
import handleBlockType from "./modifiers/handleBlockType";
import handleInlineStyle from "./modifiers/handleInlineStyle";
import handleNewCodeBlock from "./modifiers/handleNewCodeBlock";
import insertEmptyBlock from "./modifiers/insertEmptyBlock";
import handleLink from "./modifiers/handleLink";
import handleImage from "./modifiers/handleImage";
import leaveList from "./modifiers/leaveList";
import insertText from "./modifiers/insertText";
import changeCurrentBlockType from "./modifiers/changeCurrentBlockType";
import createLinkDecorator from "./decorators/link";
import createImageDecorator from "./decorators/image";
import { replaceText } from "./utils";
import { CODE_BLOCK_REGEX } from "./constants";

const INLINE_STYLE_CHARACTERS = [" ", "*", "_"];

function checkCharacterForState(editorState, character) {
  let newEditorState = handleBlockType(editorState, character);
  if (editorState === newEditorState) {
    newEditorState = handleImage(editorState, character);
  }
  if (editorState === newEditorState) {
    newEditorState = handleLink(editorState, character);
  }
  if (editorState === newEditorState) {
    newEditorState = handleInlineStyle(editorState, character);
  }
  return newEditorState;
}

function checkReturnForState(editorState, ev) {
  let newEditorState = editorState;
  const contentState = editorState.getCurrentContent();
  const selection = editorState.getSelection();
  const key = selection.getStartKey();
  const currentBlock = contentState.getBlockForKey(key);
  const type = currentBlock.getType();
  const text = currentBlock.getText();
  if (/-list-item$/.test(type) && text === "") {
    newEditorState = leaveList(editorState);
  }
  if (
    newEditorState === editorState &&
    (ev.ctrlKey ||
      ev.shiftKey ||
      ev.metaKey ||
      ev.altKey ||
      (/^header-/.test(type) &&
        selection.isCollapsed() &&
        selection.getEndOffset() === text.length))
  ) {
    newEditorState = insertEmptyBlock(editorState);
  }
  if (
    newEditorState === editorState &&
    type !== "code-block" &&
    CODE_BLOCK_REGEX.test(text)
  ) {
    newEditorState = handleNewCodeBlock(editorState);
  }
  if (newEditorState === editorState && type === "code-block") {
    if (/```\s*$/.test(text)) {
      newEditorState = changeCurrentBlockType(
        newEditorState,
        type,
        text.replace(/\n```\s*$/, "")
      );
      newEditorState = insertEmptyBlock(newEditorState);
    } else {
      const codeBlockNewLine =
        text[text.length - 1] === "\n" && text[text.length - 2] === "\n";

      if (codeBlockNewLine) {
        newEditorState = insertEmptyBlock(editorState);
      } else {
        newEditorState = insertText(editorState, "\n");
      }
    }
  }

  return newEditorState;
}

const createMarkdownPlugin = (config = {}) => {
  const store = {};
  return {
    store,
    blockRenderMap: Map({
      "code-block": {
        element: "span",
        wrapper: <pre spellCheck={"false"} />,
      },
    }).merge(checkboxBlockRenderMap),
    decorators: [
      createLinkDecorator(config, store),
      createImageDecorator(config, store),
    ],
    initialize({ setEditorState, getEditorState }) {
      store.setEditorState = setEditorState;
      store.getEditorState = getEditorState;
    },
    blockStyleFn(block) {
      switch (block.getType()) {
        case CHECKABLE_LIST_ITEM:
          return CHECKABLE_LIST_ITEM;
        default:
          break;
      }
      return null;
    },

    blockRendererFn(block, { setEditorState, getEditorState }) {
      switch (block.getType()) {
        case CHECKABLE_LIST_ITEM: {
          return {
            component: CheckableListItem,
            props: {
              onChangeChecked: () =>
                setEditorState(
                  CheckableListItemUtils.toggleChecked(getEditorState(), block)
                ),
              checked: !!block.getData().get("checked"),
            },
          };
        }
        default:
          return null;
      }
    },
    onTab(ev, { getEditorState, setEditorState }) {
      const editorState = getEditorState();
      const newEditorState = adjustBlockDepth(editorState, ev);
      if (newEditorState !== editorState) {
        setEditorState(newEditorState);
        return "handled";
      }
      return "not-handled";
    },
    handleReturn(ev, editorState, { setEditorState }) {
      let newEditorState = checkReturnForState(editorState, ev);
      if (editorState !== newEditorState) {
        setEditorState(newEditorState);
        return "handled";
      }

      // If we're in a code block don't add markdown to it
      const startKey = editorState.getSelection().getStartKey();
      if (startKey) {
        const currentBlockType = editorState
          .getCurrentContent()
          .getBlockForKey(startKey)
          .getType();
        if (currentBlockType === "code-block") return "not-handled";
      }

      newEditorState = checkCharacterForState(editorState, "\n");
      if (editorState !== newEditorState) {
        setEditorState(newEditorState);
        return "handled";
      }

      return "not-handled";
    },
    handleBeforeInput(character, editorState, { setEditorState }) {
      if (character !== " ") {
        return "not-handled";
      }
      // If we're in a code block don't add markdown to it
      const startKey = editorState.getSelection().getStartKey();
      if (startKey) {
        const currentBlockType = editorState
          .getCurrentContent()
          .getBlockForKey(startKey)
          .getType();
        if (currentBlockType === "code-block") return "not-handled";
      }

      const newEditorState = checkCharacterForState(editorState, character);
      if (editorState !== newEditorState) {
        setEditorState(newEditorState);
        return "handled";
      }
      return "not-handled";
    },
    handleKeyCommand(command, editorState, { setEditorState }) {
      // eslint-disable-next-line
      console.log(command);
      switch (command) {
        case "backspace": {
          // When a styled block is the first thing in the editor,
          // you cannot delete it. Typing backspace only deletes the content
          // but never deletes the block styling.
          // This piece of code fixes the issue by changing the block type
          // to 'unstyled' if we're on the first block of the editor and it's empty
          const selection = editorState.getSelection();
          const currentBlockKey = selection.getStartKey();
          if (!currentBlockKey) return "not-handled";

          const content = editorState.getCurrentContent();
          const currentBlock = content.getBlockForKey(currentBlockKey);
          const firstBlock = content.getFirstBlock();
          if (firstBlock !== currentBlock) return "not-handled";

          const currentBlockType = currentBlock.getType();
          const isEmpty = currentBlock.getLength() === 0;
          if (!isEmpty || currentBlockType === "unstyled") return "not-handled";

          setEditorState(changeCurrentBlockType(editorState, "unstyled", ""));
          return "handled";
        }
        case "bold": {
          setEditorState(RichUtils.toggleInlineStyle(editorState, "BOLD"));
          return "handled";
        }
        case "italic": {
          setEditorState(RichUtils.toggleInlineStyle(editorState, "ITALIC"));
          return "handled";
        }
        case "underline": {
          setEditorState(RichUtils.toggleInlineStyle(editorState, "UNDERLINE"));
          return "handled";
        }
        default: {
          return "not-handled";
        }
      }
    },
    handlePastedText(text, html, editorState, { setEditorState }) {
      if (html) {
        return "not-handled";
      }
      let newEditorState = editorState;
      let buffer = [];
      // eslint-disable-next-line no-plusplus
      for (let i = 0; i < text.length; i++) {
        if (INLINE_STYLE_CHARACTERS.indexOf(text[i]) >= 0) {
          newEditorState = replaceText(
            newEditorState,
            buffer.join("") + text[i]
          );
          newEditorState = checkCharacterForState(newEditorState, text[i]);
          buffer = [];
        } else if (text[i].charCodeAt(0) === 10) {
          newEditorState = replaceText(newEditorState, buffer.join(""));
          const tmpEditorState = checkReturnForState(newEditorState, {});
          if (newEditorState === tmpEditorState) {
            newEditorState = insertEmptyBlock(tmpEditorState);
          } else {
            newEditorState = tmpEditorState;
          }
          buffer = [];
        } else if (i === text.length - 1) {
          newEditorState = replaceText(
            newEditorState,
            buffer.join("") + text[i]
          );
          buffer = [];
        } else {
          buffer.push(text[i]);
        }
      }

      if (editorState !== newEditorState) {
        setEditorState(newEditorState);
        return "handled";
      }
      return "not-handled";
    },
  };
};

export default createMarkdownPlugin;
