import { BellRing, BellOff } from 'lucide-react';
import { usePushSubscription } from '../../hooks/usePushSubscription.js';

// Texto de cada estado de este dispositivo (§5.2 de la spec de notificaciones push).
// Nunca menciona otras cuentas.
const STATE_TEXT = {
  loading: 'Comprobando este dispositivo…',
  error: 'No se pudo comprobar este dispositivo. Recarga la página para intentarlo de nuevo.',
  'no-sw': 'Las notificaciones solo funcionan en la app compilada.',
  'ios-install': 'Para recibir avisos en el iPhone, instala la app: Compartir → Añadir a pantalla de inicio.',
  'ios-update': 'Actualiza a iOS 16.4 o posterior para recibir avisos.',
  unsupported: 'Este navegador no admite notificaciones.',
  'server-disabled': 'Las notificaciones no están configuradas en el servidor.',
  denied: 'Bloqueaste las notificaciones. Actívalas en los ajustes del navegador para Tradelog.',
  lost: 'Los avisos se desactivaron en este dispositivo.',
  off: 'Este dispositivo no recibe avisos.',
  on: 'Este dispositivo recibe los avisos de tu cuenta.',
};

const btn =
  'px-3 py-2 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700/60';

function Switch({ checked, disabled, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label="Avisos en este dispositivo"
      disabled={disabled}
      onClick={onChange}
      // Área táctil de 44 px alrededor del interruptor
      className="relative flex-shrink-0 inline-flex items-center justify-center w-14 h-11 -my-2 disabled:opacity-50"
    >
      <span
        className={`w-11 h-6 rounded-full transition-colors ${
          checked ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
        }`}
      />
      <span
        className={`absolute left-[7px] top-[12px] w-5 h-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : ''
        }`}
      />
    </button>
  );
}

/**
 * Sección "Avisos en este dispositivo" de /recordatorios: dice si ESTE dispositivo
 * está vinculado a la cuenta, y lo vincula o desvincula. Es la única forma de
 * registrar un dispositivo; los recordatorios funcionan igual sin ninguno.
 */
export default function PushToggle() {
  const { state, busy, enable, disable, sendTest } = usePushSubscription();
  const on = state === 'on';
  const hasSwitch = on || state === 'off';
  const Icon = on ? BellRing : BellOff;

  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm p-4">
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${on ? 'text-blue-600' : 'text-gray-400'}`} />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Avisos en este dispositivo</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400" aria-live="polite">
            {STATE_TEXT[state] ?? STATE_TEXT.error}
          </p>
        </div>
        {hasSwitch && <Switch checked={on} disabled={busy} onChange={on ? disable : enable} />}
      </div>

      {(on || state === 'lost') && (
        <div className="pl-8 pt-3 flex flex-wrap gap-2">
          {on && (
            <button type="button" onClick={sendTest} disabled={busy} className={btn}>
              Enviar prueba
            </button>
          )}
          {state === 'lost' && (
            <>
              <button type="button" onClick={enable} disabled={busy} className={btn}>
                Reactivar
              </button>
              <button type="button" onClick={disable} disabled={busy} className={btn}>
                Desactivar
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
