import NoteTextBlock from './NoteTextBlock.jsx';
import NoteCalloutBlock from './NoteCalloutBlock.jsx';
import NoteImageGalleryBlock from './NoteImageGalleryBlock.jsx';
import NoteImageBlock from './NoteImageBlock.jsx';
import NoteReferenceBlock from './NoteReferenceBlock.jsx';
import NoteTradeReferenceBlock from './NoteTradeReferenceBlock.jsx';

/**
 * Contenido de un bloque según su tipo. Lo usan la lista editable de una nota
 * (NoteBlockList) y el visor de repaso (BlockReviewViewer), este último con
 * `readOnly`: sin edición, y con `onLightboxChange(open)` para saber cuándo un
 * bloque abrió su visor de imágenes o el detalle de un trade.
 */
function BlockContent({ block, noteId, onUpdate, onUpdateMetadata, saveStatus, readOnly = false, onLightboxChange }) {
  // Inset horizontal uniforme (16px por lado) para todos los tipos: el borde
  // visible de cada bloque queda alineado con el contenido del bloque de texto
  // (que ya lleva px-4 propio, por eso es el único sin padding del wrapper).
  return (
    <div
      className={`rounded-xl overflow-hidden${block.block_type === 'callout' ? ' my-3 px-4' : ''}`}
    >
      {block.block_type === 'text' && (
        <NoteTextBlock
          block={block}
          readOnly={readOnly}
          onUpdate={(content) => onUpdate(block.id, content)}
          saveStatus={saveStatus}
        />
      )}
      {block.block_type === 'callout' && (
        <NoteCalloutBlock
          block={block}
          readOnly={readOnly}
          onUpdate={(content) => onUpdate(block.id, content)}
          onUpdateMetadata={(metadata) => onUpdateMetadata(block.id, metadata)}
          saveStatus={saveStatus}
        />
      )}
      {block.block_type === 'image_gallery' && (
        <NoteImageGalleryBlock block={block} noteId={noteId} readOnly={readOnly} onLightboxChange={onLightboxChange} />
      )}
      {block.block_type === 'image' && (
        <NoteImageBlock block={block} noteId={noteId} readOnly={readOnly} onLightboxChange={onLightboxChange} />
      )}
      {block.block_type === 'reference' && (
        <div className="px-4 py-1.5">
          {/* Sin onUpdateMetadata, la referencia se muestra en modo lectura */}
          <NoteReferenceBlock
            block={block}
            onUpdateMetadata={readOnly ? undefined : (metadata) => onUpdateMetadata(block.id, metadata)}
          />
        </div>
      )}
      {block.block_type === 'trade_reference' && (
        <div className="px-4 py-1.5">
          <NoteTradeReferenceBlock
            block={block}
            noteId={noteId}
            readOnly={readOnly}
            onLightboxChange={onLightboxChange}
          />
        </div>
      )}
    </div>
  );
}

export default BlockContent;
