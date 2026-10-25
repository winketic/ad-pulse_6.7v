"use client";

import type { ChangeEvent, KeyboardEvent, ReactNode } from "react";

/**
 * Крупная цифровая сетка для ввода количества на экране выпуска.
 *
 * Значение живёт в родителе как строка цифр (`value`): так исключены
 * отрицательные числа, ведущие нули и «NaN» при недопечатанном вводе.
 * Пустая строка — это пустое количество (в форме оно и раньше означало 0).
 *
 * Поле значения остаётся настоящим <input>, редактируемым с аппаратной
 * клавиатуры: и цифры на сетке, и ручной ввод пишут в один и тот же `value`,
 * поэтому значение синхронизировано в обе стороны. `inputMode="none"`
 * намеренно не поднимает системную клавиатуру телефона поверх сетки —
 * на телефоне основной путь ввода это крупные кнопки, а физическая
 * клавиатура (десктоп, планшет с чехлом) продолжает работать.
 */

/** Больше 6 цифр на выпуске не нужно: 999 999 — верхняя граница ввода. */
export const MAX_QTY_DIGITS = 6;

/** Строка цифр → целое количество. Пусто/мусор → 0 (как в форме раньше). */
export function digitsToQuantity(value: string): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Оставить только цифры, убрать ведущие нули, ограничить длину. */
export function sanitizeDigits(raw: string, maxDigits: number = MAX_QTY_DIGITS): string {
  return raw
    .replace(/\D+/g, "")
    .replace(/^0+/, "")
    .slice(0, maxDigits);
}

/** Прибавить к значению 10/100 (без ухода в минус и за верхнюю границу). */
export function bumpQuantity(
  value: string,
  delta: number,
  maxDigits: number = MAX_QTY_DIGITS,
): string {
  if (!Number.isFinite(delta) || delta <= 0) return value;
  const cap = 10 ** maxDigits - 1;
  return String(Math.min(digitsToQuantity(value) + Math.trunc(delta), cap));
}

type KeyVariant = "digit" | "action" | "primary";

/** Одна кнопка сетки: тач-цель ≥ 44×44 px, крупный шрифт, свой aria-label. */
function Key({
  children,
  ariaLabel,
  onPress,
  variant = "digit",
  disabled = false,
}: {
  children: ReactNode;
  ariaLabel: string;
  onPress: () => void;
  variant?: KeyVariant;
  disabled?: boolean;
}) {
  const skin =
    variant === "primary"
      ? "bg-[var(--accent)] text-[var(--accent-text)] shadow-[var(--glow-accent)] hover:bg-[var(--accent-hover)]"
      : variant === "action"
        ? "bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--surface-3)]"
        : "num border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text)] hover:bg-[var(--surface-2)] active:bg-[var(--surface-3)]";

  return (
    <button
      type="button"
      onClick={onPress}
      // Не забирать фокус у поля значения: после нажатия цифры можно
      // продолжить печатать с аппаратной клавиатуры.
      onMouseDown={(e) => e.preventDefault()}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`flex min-h-[44px] min-w-0 select-none items-center justify-center rounded-xl font-semibold transition-colors tap-scale disabled:cursor-not-allowed disabled:opacity-35 ${skin}`}
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      {children}
    </button>
  );
}

export type NumericKeypadProps = {
  /** Строка цифр без ведущих нулей; "" = пусто. */
  value: string;
  onChange: (value: string) => void;
  /** Подпись текущей единицы рядом с числом: «шт», «м³»… */
  unit?: string;
  /** aria-label поля и группы кнопок. */
  label?: string;
  maxDigits?: number;
  disabled?: boolean;
  className?: string;
  /**
   * Необязательное основное действие в правом нижнем углу сетки
   * (на экране выпуска — «Добавить в список»). Выпуск на сервере
   * по-прежнему запускается отдельной кнопкой родителя.
   */
  primaryAction?: {
    icon: ReactNode;
    ariaLabel: string;
    onClick: () => void;
    disabled?: boolean;
  };
};

export default function NumericKeypad({
  value,
  onChange,
  unit,
  label = "Количество",
  maxDigits = MAX_QTY_DIGITS,
  disabled = false,
  className = "",
  primaryAction,
}: NumericKeypadProps) {
  const pressDigit = (digit: string) => {
    if (value.length >= maxDigits) return;
    // Пусто + «0» — остаёмся пустыми, чтобы не появился ведущий ноль.
    if (digit === "0" && value === "") return;
    onChange(value + digit);
  };

  const handleInput = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(sanitizeDigits(e.target.value, maxDigits));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && primaryAction && !primaryAction.disabled && !disabled) {
      e.preventDefault();
      primaryAction.onClick();
    }
  };

  const primaryDisabled = disabled || Boolean(primaryAction?.disabled);

  return (
    <div
      role="group"
      aria-label={label}
      className={`flex w-full min-w-0 flex-col gap-1 ${className}`}
    >
      {/* Значение: редактируемое поле, а не картинка — ручной ввод живёт здесь */}
      <div className="flex min-w-0 items-center gap-1">
        <div className="flex h-11 min-w-0 flex-1 items-center rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-1.5 transition-colors focus-within:border-[var(--accent)]">
          <input
            type="text"
            inputMode="none"
            pattern="[0-9]*"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="0"
            disabled={disabled}
            aria-label={unit ? `${label}, ${unit}` : label}
            className="num h-full w-full min-w-0 bg-transparent text-center text-[2rem] font-bold leading-none tracking-tight text-[var(--text)] outline-none placeholder:text-[var(--muted-2)] disabled:opacity-50"
          />
        </div>
        <span
          aria-hidden="true"
          className="w-8 shrink-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm leading-none text-[var(--muted)]"
        >
          {unit}
        </span>
      </div>

      {/* Быстрые действия: +10 / +100 / сброс */}
      <div className="grid grid-cols-3 gap-1">
        <Key
          variant="action"
          ariaLabel="Прибавить 10"
          disabled={disabled}
          onPress={() => onChange(bumpQuantity(value, 10, maxDigits))}
        >
          <span className="num text-base font-bold">+10</span>
        </Key>
        <Key
          variant="action"
          ariaLabel="Прибавить 100"
          disabled={disabled}
          onPress={() => onChange(bumpQuantity(value, 100, maxDigits))}
        >
          <span className="num text-base font-bold">+100</span>
        </Key>
        <Key
          variant="action"
          ariaLabel="Очистить количество"
          disabled={disabled || value === ""}
          onPress={() => onChange("")}
        >
          <span className="text-xs font-semibold text-[var(--muted)]">Сброс</span>
        </Key>
      </div>

      {/* Цифры 1–9, 0, стереть + основное действие справа снизу */}
      <div className="grid grid-cols-3 gap-1">
        {["7", "8", "9", "4", "5", "6", "1", "2", "3"].map((digit) => (
          <Key
            key={digit}
            ariaLabel={`Цифра ${digit}`}
            disabled={disabled}
            onPress={() => pressDigit(digit)}
          >
            <span className="num text-xl">{digit}</span>
          </Key>
        ))}
        <Key
          variant="action"
          ariaLabel="Стереть"
          disabled={disabled || value === ""}
          onPress={() => onChange(value.slice(0, -1))}
        >
          <svg
            aria-hidden="true"
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z"
            />
          </svg>
        </Key>
        <Key ariaLabel="Цифра 0" disabled={disabled} onPress={() => pressDigit("0")}>
          <span className="num text-xl">0</span>
        </Key>
        {primaryAction ? (
          <Key
            variant="primary"
            ariaLabel={primaryAction.ariaLabel}
            disabled={primaryDisabled}
            onPress={primaryAction.onClick}
          >
            {primaryAction.icon}
          </Key>
        ) : (
          <span aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
