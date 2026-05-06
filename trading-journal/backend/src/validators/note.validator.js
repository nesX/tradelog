import Joi from 'joi';

export const createNoteSchema = Joi.object({
  title: Joi.string().max(500).optional().default('Sin título'),
  parent_note_id: Joi.number().integer().positive().allow(null).optional(),
  type: Joi.string().valid('note', 'section').default('note'),
}).custom((value, helpers) => {
  if (value.type === 'section' && value.parent_note_id != null) {
    return helpers.error('any.invalid');
  }
  return value;
});

export const updateNoteTitleSchema = Joi.object({
  title: Joi.string().max(500).required(),
});

export const reorderNotesSchema = Joi.object({
  note_ids: Joi.array().items(Joi.number().integer().positive()).min(1).required(),
});

export const moveNoteSchema = Joi.object({
  parent_note_id: Joi.number().integer().positive().allow(null).required(),
});

export const moveDndNoteSchema = Joi.object({
  targetId: Joi.number().integer().positive().required(),
  dropType: Joi.string().valid('sibling-above', 'sibling-below', 'child').required(),
});

export const moveBlockDndSchema = Joi.object({
  targetBlockId: Joi.number().integer().positive().required(),
  dropType: Joi.string().valid('sibling-above', 'sibling-below').required(),
});

export const createBlockSchema = Joi.object({
  block_type: Joi.string().valid('text', 'image_gallery', 'note_link', 'callout').required(),
  content: Joi.string().max(50000).allow(null, '').optional(),
  linked_note_id: Joi.number().integer().positive().allow(null).optional(),
  position: Joi.number().integer().min(0).optional(),
  metadata: Joi.object({
    style: Joi.string().valid('info', 'warning', 'success', 'error', 'note').optional(),
    icon: Joi.string().max(10).allow(null).optional(),
  }).default({}),
});

export const updateBlockSchema = Joi.object({
  content: Joi.string().max(50000).allow('').required(),
});

export const updateCalloutMetadataSchema = Joi.object({
  style: Joi.string().valid('info', 'warning', 'success', 'error', 'note').optional(),
  icon: Joi.string().max(10).allow(null).optional(),
  analysis_date: Joi.string().isoDate().allow(null, '').optional(),
  symbols: Joi.array().items(Joi.string().max(20).uppercase()).max(10).optional(),
});

export const reorderBlocksSchema = Joi.object({
  block_ids: Joi.array().items(Joi.number().integer().positive()).min(1).required(),
});

export const createTagSchema = Joi.object({
  name: Joi.string().max(100).trim().required(),
  color: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export const updateTagSchema = Joi.object({
  name: Joi.string().max(100).trim().optional(),
  color: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export const assignTagsSchema = Joi.object({
  tag_ids: Joi.array().items(Joi.number().integer().positive()).required(),
});

export const removeTagsSchema = Joi.object({
  tag_ids: Joi.array().items(Joi.number().integer().positive()).min(1).required(),
});

export const noteSearchSchema = Joi.object({
  q: Joi.string().max(500).allow('').optional(),
  tag_ids: Joi.string().pattern(/^\d+(,\d+)*$/).optional(),
  limit: Joi.number().integer().min(1).max(100).default(30),
});

export const updateImageCaptionSchema = Joi.object({
  caption: Joi.string().max(1000).allow(null, '').optional(),
});

export const reorderImagesSchema = Joi.object({
  image_ids: Joi.array().items(Joi.number().integer().positive()).min(1).required(),
});

export const toggleFollowUpSchema = Joi.object({
  requires_follow_up: Joi.boolean().required(),
});
