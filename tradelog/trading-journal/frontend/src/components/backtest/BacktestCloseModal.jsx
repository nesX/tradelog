import { useState } from 'react';
import Modal from '../common/Modal.jsx';
import BacktestMoodSelector from './BacktestMoodSelector.jsx';

const BacktestCloseModal = ({ isOpen, onClose, onConfirm, isLoading = false }) => {
  const [moodScore, setMoodScore] = useState(null);
  const [moodComment, setMoodComment] = useState('');
  const [closingComment, setClosingComment] = useState('');
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (!moodScore) e.mood = 'El estado anímico final es obligatorio';
    if (!closingComment.trim()) e.closing = 'El comentario de cierre es obligatorio';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleConfirm = () => {
    if (!validate()) return;
    onConfirm({
      mood_end_score: moodScore,
      mood_end_comment: moodComment || undefined,
      closing_comment: closingComment.trim(),
    });
  };

  const handleClose = () => {
    setMoodScore(null);
    setMoodComment('');
    setClosingComment('');
    setErrors({});
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Cerrar sesión" size="md">
      <div className="space-y-5">
        {/* Estado anímico final */}
        <BacktestMoodSelector
          value={moodScore}
          onChange={setMoodScore}
          comment={moodComment}
          onCommentChange={setMoodComment}
          label="Estado anímico final *"
        />
        {errors.mood && (
          <p className="text-xs text-red-500 -mt-3">{errors.mood}</p>
        )}

        {/* Comentario de cierre */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Comentario de cierre *
          </label>
          <textarea
            value={closingComment}
            onChange={(e) => setClosingComment(e.target.value)}
            placeholder="¿Qué aprendiste en esta sesión?"
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          {errors.closing && (
            <p className="text-xs text-red-500">{errors.closing}</p>
          )}
        </div>

        {/* Botones */}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={handleClose}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Cerrando...' : 'Cerrar sesión'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default BacktestCloseModal;
