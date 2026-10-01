'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calcularElegibilidad,
  ErrorConfiguracionInvalida,
} = require('./calculoElegibilidad');

// Configuración de prueba: los valores son entradas, no parte de la lógica.
function configuracion(overrides = {}) {
  return {
    pesos: { promedio: 0.5, estrato: 0.25, ingresos: 0.25 },
    escalas: { promedioMaximo: 5, estratoMaximo: 6, ingresosReferencia: 4000000 },
    umbrales: { elegible: 70, limitrofe: 50 },
    ...overrides,
  };
}

function estudiante(overrides = {}) {
  return {
    promedioAcumulado: 4.5,
    estrato: 1,
    ingresosHogar: 1000000,
    ...overrides,
  };
}

// Puntaje esperado con estudiante() y configuracion():
// 0.5*(4.5/5) + 0.25*((6-1)/5) + 0.25*(1-1000000/4000000) = 0.45+0.25*1+0.1875 = 0.8875 -> 88.75
test('Criterio 1: produce un puntaje numérico y clasifica como elegible según los umbrales', () => {
  const resultado = calcularElegibilidad(estudiante(), configuracion());

  assert.equal(typeof resultado.puntaje, 'number');
  assert.ok(Math.abs(resultado.puntaje - 88.75) < 1e-9);
  assert.equal(resultado.clasificacion, 'elegible');
});

test('Criterio 1: clasifica como limitrofe entre el umbral limitrofe y el elegible', () => {
  // promedio 3.5 -> 35, estrato 4 -> 0.25*(2/5)=10, ingresos 2000000 -> 12.5 : 57.5
  const resultado = calcularElegibilidad(
    estudiante({ promedioAcumulado: 3.5, estrato: 4, ingresosHogar: 2000000 }),
    configuracion()
  );

  assert.ok(Math.abs(resultado.puntaje - 57.5) < 1e-9);
  assert.equal(resultado.clasificacion, 'limitrofe');
});

test('Criterio 1: clasifica como no_elegible por debajo del umbral limitrofe', () => {
  const resultado = calcularElegibilidad(
    estudiante({ promedioAcumulado: 2, estrato: 6, ingresosHogar: 8000000 }),
    configuracion()
  );

  assert.equal(resultado.clasificacion, 'no_elegible');
  assert.ok(resultado.puntaje < 50);
});

test('Criterio 1: los umbrales configurados cambian la clasificación del mismo puntaje', () => {
  const datos = estudiante();
  const estricta = configuracion({ umbrales: { elegible: 95, limitrofe: 90 } });
  const laxa = configuracion({ umbrales: { elegible: 80, limitrofe: 60 } });

  assert.equal(calcularElegibilidad(datos, estricta).clasificacion, 'no_elegible');
  assert.equal(calcularElegibilidad(datos, laxa).clasificacion, 'elegible');
});

test('Criterio 1: los valores iguales a los umbrales caen en la categoría superior', () => {
  const config = configuracion({ umbrales: { elegible: 88.75, limitrofe: 50 } });
  assert.equal(calcularElegibilidad(estudiante(), config).clasificacion, 'elegible');

  const config2 = configuracion({ umbrales: { elegible: 95, limitrofe: 88.75 } });
  assert.equal(calcularElegibilidad(estudiante(), config2).clasificacion, 'limitrofe');
});

test('Criterio 1: el puntaje queda acotado entre 0 y 100 con valores fuera de escala', () => {
  const alto = calcularElegibilidad(
    estudiante({ promedioAcumulado: 9, estrato: 0, ingresosHogar: -5 }),
    configuracion()
  );
  const bajo = calcularElegibilidad(
    estudiante({ promedioAcumulado: 0, estrato: 6, ingresosHogar: 99999999 }),
    configuracion()
  );

  assert.equal(alto.puntaje, 100);
  assert.equal(bajo.puntaje, 0);
});

test('Criterio 2: sin promedio académico marca datos_incompletos sin decisión automática', () => {
  const resultado = calcularElegibilidad(
    estudiante({ promedioAcumulado: undefined }),
    configuracion()
  );

  assert.equal(resultado.clasificacion, 'datos_incompletos');
  assert.equal(resultado.puntaje, null);
  assert.equal(resultado.decisionAutomatica, false);
  assert.deepEqual(resultado.camposFaltantes, ['promedioAcumulado']);
});

test('Criterio 2: promedio null o vacío también es datos_incompletos', () => {
  for (const vacio of [null, '']) {
    const resultado = calcularElegibilidad(estudiante({ promedioAcumulado: vacio }), configuracion());
    assert.equal(resultado.clasificacion, 'datos_incompletos');
    assert.equal(resultado.puntaje, null);
  }
});

test('Criterio 2: un promedio de 0 es un dato registrado, no incompleto', () => {
  const resultado = calcularElegibilidad(estudiante({ promedioAcumulado: 0 }), configuracion());
  assert.notEqual(resultado.clasificacion, 'datos_incompletos');
  assert.equal(typeof resultado.puntaje, 'number');
});

test('Criterio 2: falta de estrato o ingresos también lista los campos faltantes', () => {
  const resultado = calcularElegibilidad(
    { promedioAcumulado: 4 },
    configuracion()
  );

  assert.equal(resultado.clasificacion, 'datos_incompletos');
  assert.deepEqual(resultado.camposFaltantes, ['estrato', 'ingresosHogar']);
});

test('Resultado con decisión: indica decisión automática y sin campos faltantes', () => {
  const resultado = calcularElegibilidad(estudiante(), configuracion());
  assert.equal(resultado.decisionAutomatica, true);
  assert.deepEqual(resultado.camposFaltantes, []);
});

test('Configuración inválida: falta de umbrales, pesos o escalas lanza ErrorConfiguracionInvalida', () => {
  assert.throws(
    () => calcularElegibilidad(estudiante(), configuracion({ umbrales: undefined })),
    ErrorConfiguracionInvalida
  );
  assert.throws(
    () => calcularElegibilidad(estudiante(), configuracion({ pesos: undefined })),
    ErrorConfiguracionInvalida
  );
  assert.throws(
    () => calcularElegibilidad(estudiante(), configuracion({ escalas: undefined })),
    ErrorConfiguracionInvalida
  );
  assert.throws(() => calcularElegibilidad(estudiante()), ErrorConfiguracionInvalida);
});

test('Configuración inválida: umbral limítrofe mayor que el elegible', () => {
  assert.throws(
    () => calcularElegibilidad(estudiante(), configuracion({ umbrales: { elegible: 40, limitrofe: 60 } })),
    ErrorConfiguracionInvalida
  );
});

test('Configuración inválida: pesos que no suman 1 o escalas no positivas', () => {
  assert.throws(
    () =>
      calcularElegibilidad(
        estudiante(),
        configuracion({ pesos: { promedio: 0.5, estrato: 0.5, ingresos: 0.5 } })
      ),
    ErrorConfiguracionInvalida
  );
  assert.throws(
    () =>
      calcularElegibilidad(
        estudiante(),
        configuracion({ escalas: { promedioMaximo: 0, estratoMaximo: 6, ingresosReferencia: 1 } })
      ),
    ErrorConfiguracionInvalida
  );
});
