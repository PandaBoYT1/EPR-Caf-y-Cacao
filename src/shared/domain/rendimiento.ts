/**
 * Rendimiento del café (secciones 7, 8, 9 y 28 de la especificación).
 *
 * El usuario ingresa SOLO tres pesos; el sistema calcula todo lo demás.
 *
 *   merma_g      = muestra_inicial − peso_pilado            (cáscara)
 *   merma_%      = merma_g / muestra_inicial × 100
 *   defectos     = peso_pilado − almendra_sana              (granos malos)
 *   RENDIMIENTO  = almendra_sana / (muestra_inicial / 100)
 *                  (muestra 200 g -> se divide entre 2; 300 g -> entre 3)
 *   FACTOR       = (70 × muestra_inicial) / almendra_sana
 *
 * Ejemplos:
 *   muestra 200 g, pilado 160 g, almendra 140 g
 *   -> merma 40 g (20 %), rendimiento 140 / 2 = 70
 *   muestra 250 g, pilado 205 g, almendra 193 g (sección 28)
 *   -> merma 45 g (18 %), rendimiento 77.2, factor (70×250)/193 ≈ 90.67 (se muestra 90.6)
 */

/** Muestra inicial por defecto usada por el negocio (gramos). Configurable. */
export const MUESTRA_INICIAL_DEFECTO_G = 250;

/** Constante del factor usada por el negocio en (70 × muestra) / almendra. */
export const FACTOR_CONSTANTE = 70;

/** Rango de referencia de la merma del pilado (%). Configurable (REGLA 10). */
export const MERMA_REF_MIN_DEFECTO = 18;
export const MERMA_REF_MAX_DEFECTO = 20;

export interface RendimientoInput {
  muestraInicialG: number;
  pesoPiladoG: number;
  almendraSanaG: number;
}

export interface RendimientoOpciones {
  mermaRefMin?: number;
  mermaRefMax?: number;
}

export interface RendimientoResultado {
  muestraInicialG: number;
  pesoPiladoG: number;
  almendraSanaG: number;
  /** Merma del pilado en gramos. */
  mermaG: number;
  /** Merma del pilado en porcentaje (2 decimales). */
  mermaPct: number;
  /** Peso de granos defectuosos separados, en gramos. */
  defectosG: number;
  /** Rendimiento: almendra sana / (muestra / 100) (2 decimales, ej. 70 o 77.2). */
  rendimientoPct: number;
  /** Factor / rendimiento (2 decimales, ej. 90.67). */
  factor: number;
  /** Factor listo para mostrar, truncado a 1 decimal (ej. "90.6"). */
  factorMostrar: string;
  /** true si los datos pasan las validaciones duras. */
  valido: boolean;
  /** Errores que invalidan el cálculo (datos absurdos). */
  errores: string[];
  /** Advertencias que NO bloquean la operación (merma fuera de rango). */
  advertencias: string[];
}

/** Redondea a `decimales` posiciones de forma estable. */
function redondear(valor: number, decimales: number): number {
  const f = 10 ** decimales;
  return Math.round(valor * f) / f;
}

/** Trunca a `decimales` posiciones (sin redondear hacia arriba). */
function truncar(valor: number, decimales: number): number {
  const f = 10 ** decimales;
  return Math.trunc(valor * f) / f;
}

/**
 * Calcula el rendimiento del café con todas las validaciones y advertencias.
 * Nunca lanza excepción: devuelve `valido:false` con la lista de errores.
 */
export function calcularRendimiento(
  input: RendimientoInput,
  opciones: RendimientoOpciones = {},
): RendimientoResultado {
  const { muestraInicialG, pesoPiladoG, almendraSanaG } = input;
  const mermaMin = opciones.mermaRefMin ?? MERMA_REF_MIN_DEFECTO;
  const mermaMax = opciones.mermaRefMax ?? MERMA_REF_MAX_DEFECTO;

  const errores: string[] = [];
  const advertencias: string[] = [];

  // --- Validaciones duras (sección 9) ---
  if (!(muestraInicialG > 0) || !(pesoPiladoG > 0) || !(almendraSanaG > 0)) {
    errores.push('Todos los pesos deben ser mayores que cero.');
  }
  if (pesoPiladoG > muestraInicialG) {
    errores.push('El peso después del pilado no puede ser mayor que la muestra inicial.');
  }
  if (almendraSanaG > pesoPiladoG) {
    errores.push('La almendra sana no puede ser mayor que el peso después del pilado.');
  }

  const mermaG = muestraInicialG - pesoPiladoG;
  const defectosG = pesoPiladoG - almendraSanaG;
  const mermaPct =
    muestraInicialG > 0 ? redondear((mermaG / muestraInicialG) * 100, 2) : 0;

  // Rendimiento: la almendra sana expresada por cada 100 g de muestra.
  const rendimientoPct =
    muestraInicialG > 0 ? redondear(almendraSanaG / (muestraInicialG / 100), 2) : 0;

  // Factor solo tiene sentido con almendra > 0.
  const factor =
    almendraSanaG > 0
      ? redondear((FACTOR_CONSTANTE * muestraInicialG) / almendraSanaG, 2)
      : 0;

  // --- Advertencias de merma (no bloquean) ---
  if (errores.length === 0) {
    if (mermaPct < mermaMin) {
      advertencias.push(
        `Merma (${mermaPct}%) por debajo del rango de referencia (${mermaMin}%–${mermaMax}%). Verifique los datos.`,
      );
    } else if (mermaPct > mermaMax) {
      advertencias.push(
        `Merma (${mermaPct}%) por encima del rango de referencia (${mermaMin}%–${mermaMax}%). Verifique los datos.`,
      );
    } else {
      advertencias.push('Merma dentro del rango de referencia.');
    }
  }

  return {
    muestraInicialG,
    pesoPiladoG,
    almendraSanaG,
    mermaG,
    mermaPct,
    defectosG,
    rendimientoPct,
    factor,
    factorMostrar: truncar(factor, 1).toFixed(1),
    valido: errores.length === 0,
    errores,
    advertencias,
  };
}
