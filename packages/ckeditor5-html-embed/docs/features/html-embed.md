---
category: features
menu-title: HTML embed
---

# HTML embed

The {@link module:html-embed/htmlembed~HtmlEmbed} plugin provides the possibility to insert a HTML code into the CKEditor 5 WYSIWYG editor.

## Demo

Use the editor below to see the {@link module:html-embed/htmlembed~HtmlEmbed} plugin in action.

{@snippet features/html-embed}

## Related features

CKEditor 5 supports a wider range of paste features, including:
* {@link features/paste-plaintext Paste plain text} &ndash; Detects when a plain text is pasted and acts accordingly.
* {@link features/paste-from-word Paste from Word} &ndash; Allows you to paste content from Microsoft Word and maintain the original structure and formatting.
* {@link features/paste-from-google-docs Paste from Google Docs} &ndash; Allows you to paste content from Google Docs maintaining the original formatting and structure.

## Installation

To add this feature to your rich-text editor, install the [`@ckeditor/ckeditor5-html-embed`](https://www.npmjs.com/package/@ckeditor/ckeditor5-html-embed) package:

```plaintext
npm install --save @ckeditor/ckeditor5-html-embed
```

And add it to your plugin list configuration:

```js
import HtmlEmbed from '@ckeditor/ckeditor5-html-embed/src/htmlembed';

ClassicEditor
	.create( document.querySelector( '#editor' ), {
		plugins: [ HtmlEmbed, ... ],
		toolbar: [ 'htmlEmbed', ... ],
	} )
	.then( ... )
	.catch( ... );
```

<info-box info>
	Read more about {@link builds/guides/integration/installing-plugins installing plugins}.
</info-box>

## Common API

The {@link module:html-embed/htmlembed~HtmlEmbed} plugin registers:
* the UI button component (`'htmlEmbed'`),
* the `'htmlEmbed'` command implemented by {@link module:html-embed/htmlembedcommand~HtmlEmbedCommand}.

The command can be executed using the {@link module:core/editor/editor~Editor#execute `editor.execute()`} method:

```js
editor.execute( 'htmlEmbed', { html: 'HTML to insert.' } );
```

<info-box>
	We recommend using the official {@link framework/guides/development-tools#ckeditor-5-inspector CKEditor 5 inspector} for development and debugging. It will give you tons of useful information about the state of the editor such as internal data structures, selection, commands, and many more.
</info-box>

## Contribute

The source code of the feature is available on GitHub in https://github.com/ckeditor/ckeditor5/tree/master/packages/ckeditor5-html-embed.
