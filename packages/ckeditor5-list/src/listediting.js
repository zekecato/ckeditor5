/**
 * @license Copyright (c) 2003-2021, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/**
 * @module list/listediting
 */

import ListCommand from './listcommand';
import IndentCommand from './indentcommand';

import { Plugin } from 'ckeditor5/src/core';
import { Enter } from 'ckeditor5/src/enter';
import { Delete } from 'ckeditor5/src/typing';
import { TreeWalker } from 'ckeditor5/src/engine';
import { uid } from 'ckeditor5/src/utils';

import {
	cleanList,
	cleanListItem,
	modelViewInsertion,
	modelViewChangeType,
	modelViewMergeAfterChangeType,
	modelViewMergeAfter,
	modelViewRemove,
	modelViewSplitOnInsert,
	modelViewChangeIndent,
	modelChangePostFixer,
	modelIndentPasteFixer,
	viewModelConverter,
	modelToViewPosition,
	viewToModelPosition
} from './converters';

/**
 * The engine of the list feature. It handles creating, editing and removing lists and list items.
 *
 * It registers the `'numberedList'`, `'bulletedList'`, `'indentList'` and `'outdentList'` commands.
 *
 * @extends module:core/plugin~Plugin
 */
export default class ListEditing extends Plugin {
	/**
	 * @inheritDoc
	 */
	static get pluginName() {
		return 'ListEditing';
	}

	/**
	 * @inheritDoc
	 */
	static get requires() {
		return [ Enter, Delete ];
	}

	/**
	 * @inheritDoc
	 */
	init() {
		const editor = this.editor;

		// Schema.
		// Note: in case `$block` will ever be allowed in `listItem`, keep in mind that this feature
		// uses `Selection#getSelectedBlocks()` without any additional processing to obtain all selected list items.
		// If there are blocks allowed inside list item, algorithms using `getSelectedBlocks()` will have to be modified.
		editor.model.schema.register( 'listItem', {
			inheritAllFrom: '$block',
			allowAttributes: [ 'listType', 'listIndent' ]
		} );

		// Converters.
		const data = editor.data;
		const editing = editor.editing;

		editor.model.document.registerPostFixer( writer => modelChangePostFixer( editor.model, writer ) );

		editing.mapper.registerViewToModelLength( 'li', getViewListItemLength );
		data.mapper.registerViewToModelLength( 'li', getViewListItemLength );

		editing.mapper.on( 'modelToViewPosition', modelToViewPosition( editing.view ) );
		editing.mapper.on( 'viewToModelPosition', viewToModelPosition( editor.model ) );
		data.mapper.on( 'modelToViewPosition', modelToViewPosition( editing.view ) );

		editor.conversion.for( 'editingDowncast' )
			.add( dispatcher => {
				dispatcher.on( 'insert', modelViewSplitOnInsert, { priority: 'high' } );
				dispatcher.on( 'insert:listItem', modelViewInsertion( editor.model ) );
				dispatcher.on( 'attribute:listType:listItem', modelViewChangeType, { priority: 'high' } );
				dispatcher.on( 'attribute:listType:listItem', modelViewMergeAfterChangeType, { priority: 'low' } );
				dispatcher.on( 'attribute:listIndent:listItem', modelViewChangeIndent( editor.model ) );
				dispatcher.on( 'remove:listItem', modelViewRemove( editor.model ) );
				dispatcher.on( 'remove', modelViewMergeAfter, { priority: 'low' } );
			} );

		editor.conversion.for( 'dataDowncast' )
			.add( dispatcher => {
				dispatcher.on( 'insert', modelViewSplitOnInsert, { priority: 'high' } );
				dispatcher.on( 'insert:listItem', modelViewInsertion( editor.model ) );
			} );

		editor.conversion.for( 'upcast' )
			.add( dispatcher => {
				dispatcher.on( 'element:ul', cleanList, { priority: 'high' } );
				dispatcher.on( 'element:ol', cleanList, { priority: 'high' } );
				dispatcher.on( 'element:li', cleanListItem, { priority: 'high' } );
				dispatcher.on( 'element:li', viewModelConverter );
			} );

		// Fix indentation of pasted items.
		editor.model.on( 'insertContent', modelIndentPasteFixer, { priority: 'high' } );

		// Register commands for numbered and bulleted list.
		editor.commands.add( 'numberedList', new ListCommand( editor, 'numbered' ) );
		editor.commands.add( 'bulletedList', new ListCommand( editor, 'bulleted' ) );

		// Register commands for indenting.
		editor.commands.add( 'indentList', new IndentCommand( editor, 'forward' ) );
		editor.commands.add( 'outdentList', new IndentCommand( editor, 'backward' ) );

		const viewDocument = editing.view.document;

		// Overwrite default Enter key behavior.
		this.listenTo( viewDocument, 'enter', getEnterHandlingCallback( editor ) /* , { context: 'li' } */ );

		// Overwrite default Backspace key behavior.
		this.listenTo( viewDocument, 'delete', getDeleteHandlingCallback( editor ) /* , { context: 'li' } */ );

		const getCommandExecuter = commandName => {
			return ( data, cancel ) => {
				const command = this.editor.commands.get( commandName );

				if ( command.isEnabled ) {
					this.editor.execute( commandName );
					cancel();
				}
			};
		};

		editor.keystrokes.set( 'Tab', getCommandExecuter( 'indentList' ) );
		editor.keystrokes.set( 'Shift+Tab', getCommandExecuter( 'outdentList' ) );
	}

	/**
	 * @inheritDoc
	 */
	afterInit() {
		const editor = this.editor;
		const commands = editor.commands;

		// Enable the document list on all block content.
		for ( const definition of getBlockDefinitions( editor.model.schema ) ) {
			editor.model.schema.extend( definition.name, {
				allowAttributes: [ 'listType', 'listIndent', 'listItemId' ]
			} );
		}

		const indent = commands.get( 'indent' );
		const outdent = commands.get( 'outdent' );

		if ( indent ) {
			indent.registerChildCommand( commands.get( 'indentList' ) );
		}

		if ( outdent ) {
			outdent.registerChildCommand( commands.get( 'outdentList' ) );
		}
	}

	/**
	 * Used only for mocking the `uid()` function's output.
	 *
	 * TODO: Move to the ListUtils plugin.
	 *
	 * @protected
	 * @returns {String}
	 */
	_getElementUniqueId() {
		return uid();
	}
}

function getViewListItemLength( element ) {
	let length = 1;

	for ( const child of element.getChildren() ) {
		if ( child.name == 'ul' || child.name == 'ol' ) {
			for ( const item of child.getChildren() ) {
				length += getViewListItemLength( item );
			}
		}
	}

	return length;
}

// ----------------------------------------------------------------------------------------------------------------------------
//
// Returns a callback that handles the `Enter` key.
//
// @param {module:core/editor/editor~Editor} editor
// @return {Function}
function getEnterHandlingCallback( editor ) {
	// TODO: Use `ListUtils` here.
	const listUtils = editor.plugins.get( 'ListEditing' );

	return ( evt, data ) => {
		const doc = editor.model.document;
		const position = doc.selection.getLastPosition();
		const positionParent = position.parent;

		// Do nothing for the non-collapsed selection.
		if ( !doc.selection.isCollapsed ) {
			return;
		}

		// Do nothing if an element is not empty.
		if ( !positionParent.isEmpty ) {
			return;
		}

		// And do nothing if the element is not a part of a list.
		if ( !isListBlock( positionParent ) ) {
			return;
		}

		// Find the last block item in the current handled list item.
		const allBlockItems = findListBlocksInListItem( position );
		const lastBlockItem = allBlockItems[ allBlockItems.length - 1 ];

		// Whether an action was applied.
		let applied;

		// If the selection is in the empty last block, we have two situations to handle:
		// 1. Transform the last block in a list into a new list item.
		// 2. Decrease the indent level.
		//
		// The first happens if pressed the `enter` key in the last empty block item.
		// The second occurs if the block was the only one item in the list item.
		if ( areRepresentingSameList( positionParent, positionParent.previousSibling ) && lastBlockItem === positionParent ) {
			editor.model.change( writer => {
				writer.setAttribute( 'listItemId', listUtils._getElementUniqueId(), positionParent );
			} );

			applied = true;
		} else if ( allBlockItems.length === 1 ) {
			editor.execute( 'outdentList' );
			applied = true;
		}

		if ( applied ) {
			data.preventDefault();
			evt.stop();
		}
	};
}

// Returns a callback that handles the `Delete` / `Backspace` keys.
//
// @param {module:core/editor/editor~Editor} editor
// @return {Function}
function getDeleteHandlingCallback( editor ) {
	// If Backspace key is pressed with selection collapsed on first position in first list item, outdent it. #83

	// TODO: Use `ListUtils` here.
	const listUtils = editor.plugins.get( 'ListEditing' );

	return ( evt, data ) => {
		// Check conditions from those that require less computations like those immediately available.
		if ( data.direction !== 'backward' ) {
			return;
		}

		const selection = editor.model.document.selection;

		if ( !selection.isCollapsed ) {
			return;
		}

		const firstPosition = selection.getFirstPosition();

		if ( !firstPosition.isAtStart ) {
			return;
		}

		const positionParent = firstPosition.parent;

		if ( positionParent.name !== 'listItem' ) {
			return;
		}

		const previousIsAListItem = positionParent.previousSibling && positionParent.previousSibling.name === 'listItem';

		if ( previousIsAListItem ) {
			return;
		}

		editor.execute( 'outdentList' );

		data.preventDefault();
		evt.stop();
	};
}

// ----------------------------------------------------------------------------------------------------------------------------
// -- TODO: Extract these utils to a new plugin: ListUtils.
// -- `ListEditing._getElementUniqueId()` should be moved as well.
// ----------------------------------------------------------------------------------------------------------------------------

/**
 * Returns an array containing block items that can be a child of a list item.
 *
 * @param {module:engine/model/schema~Schema} schema
 * @return {Array.<module:engine/model/schema~SchemaCompiledItemDefinition>}
 */
function getBlockDefinitions( schema ) {
	return Object.values( schema.getDefinitions() )
		.filter( definition => !definition.name.startsWith( '$' ) && definition.isBlock );
}

/**
 * Checks whether specified blocks belong to the same list item.
 *
 * @param {module:engine/model/element~Element} blockA
 * @param {module:engine/model/element~Element} blockB
 * @return {Boolean}
 */
function areRepresentingSameList( blockA, blockB ) {
	if ( !blockB ) {
		return false;
	}

	return blockA.getAttribute( 'listItemId' ) === blockB.getAttribute( 'listItemId' );
}

/**
 * Checks whether the specified `element` is a list item.
 *
 * @param {module:engine/model/element~Element} element
 * @return {Boolean}
 */
function isListBlock( element ) {
	return element.hasAttribute( 'listItemId' );
}

/**
 * Returns an array containing all block items that belong to the single list item.
 *
 * @param {module:engine/model/position~Position} position
 * @return {Array.<module:engine/model/element~Element>}
 */
function findListBlocksInListItem( position ) {
	const listItemId = position.parent.getAttribute( 'listItemId' );

	return [
		...getSimilarListItem( 'backward' ).reverse(),
		...getSimilarListItem( 'forward' )
	];

	function getSimilarListItem( direction ) {
		const options = {
			ignoreElementEnd: true,
			startPosition: position,
			shallow: true,
			direction
		};

		return [ ...new TreeWalker( options ) ]
			.filter( value => value.item.is( 'element' ) )
			.map( value => value.item )
			.filter( element => element.getAttribute( 'listItemId' ) === listItemId );
	}
}
