// IndexedDB mínimo y en memoria, solo con lo que usa src/lib/offline/db.ts.
//
// No pretende ser completo: guarda copias (structuredClone) como el de verdad,
// contesta las solicitudes en otra vuelta del bucle de eventos y cierra la
// transacción cuando ya no le quedan solicitudes pendientes. Suficiente para
// probar el orden de la cola sin un navegador.

function tarde(fn) {
  setTimeout(fn, 0);
}

class Solicitud {
  constructor(tx) {
    this.tx = tx;
    this.result = undefined;
    this.error = null;
    this.onsuccess = null;
    this.onerror = null;
  }
}

class Tienda {
  constructor(def) {
    this.def = def;
  }

  _pedir(tx, calcular) {
    const solicitud = new Solicitud(tx);
    tx._pendientes++;
    let resultado;
    let error = null;
    try {
      resultado = calcular();
    } catch (e) {
      error = e;
    }
    tarde(() => {
      tx._pendientes--;
      if (error) {
        solicitud.error = error;
        solicitud.onerror?.({ target: solicitud });
      } else {
        solicitud.result = resultado;
        solicitud.onsuccess?.({ target: solicitud });
      }
      tx._quizasTerminar();
    });
    return solicitud;
  }

  _clave(valor) {
    if (this.def.keyPath) return valor[this.def.keyPath];
    return undefined;
  }

  _escribir(valor, soloNuevo) {
    const copia = structuredClone(valor);
    let clave = this._clave(copia);
    if (clave === undefined && this.def.autoIncrement) {
      clave = ++this.def.contador;
      copia[this.def.keyPath] = clave;
    }
    if (soloNuevo && this.def.filas.has(clave)) {
      throw new Error("ConstraintError");
    }
    this.def.filas.set(clave, copia);
    return clave;
  }

  add(valor) {
    return this._pedir(this.tx, () => this._escribir(valor, true));
  }
  put(valor) {
    return this._pedir(this.tx, () => this._escribir(valor, false));
  }
  get(clave) {
    return this._pedir(this.tx, () => structuredClone(this.def.filas.get(clave)));
  }
  delete(clave) {
    return this._pedir(this.tx, () => {
      this.def.filas.delete(clave);
    });
  }
  clear() {
    return this._pedir(this.tx, () => this.def.filas.clear());
  }
  getAll() {
    return this._pedir(this.tx, () => [...this.def.filas.values()].map((v) => structuredClone(v)));
  }
  index(nombre) {
    const campo = this.def.indices.get(nombre);
    const filtrar = (valor) =>
      [...this.def.filas.entries()].filter(([, fila]) => fila[campo] === valor);
    return {
      getAll: (valor) => this._pedir(this.tx, () => filtrar(valor).map(([, v]) => structuredClone(v))),
      getAllKeys: (valor) => this._pedir(this.tx, () => filtrar(valor).map(([k]) => k)),
    };
  }
  createIndex(nombre, campo) {
    this.def.indices.set(nombre, campo);
  }
}

class Transaccion {
  constructor(bd) {
    this.bd = bd;
    this._pendientes = 0;
    this._terminada = false;
    this.oncomplete = null;
    this.onerror = null;
    this.onabort = null;
    this.error = null;
    // Una transacción sin solicitudes también termina.
    tarde(() => this._quizasTerminar());
  }
  objectStore(nombre) {
    const tienda = new Tienda(this.bd.tiendas.get(nombre));
    tienda.tx = this;
    return tienda;
  }
  _quizasTerminar() {
    if (this._terminada || this._pendientes > 0) return;
    // Damos una vuelta más: el código que espera la respuesta puede pedir otra
    // cosa dentro de la misma transacción.
    tarde(() => {
      if (this._terminada || this._pendientes > 0) return;
      this._terminada = true;
      this.oncomplete?.();
    });
  }
}

class BaseFalsa {
  constructor() {
    this.tiendas = new Map();
    this.objectStoreNames = { contains: (n) => this.tiendas.has(n) };
  }
  createObjectStore(nombre, opciones = {}) {
    const def = {
      keyPath: opciones.keyPath,
      autoIncrement: Boolean(opciones.autoIncrement),
      contador: 0,
      filas: new Map(),
      indices: new Map(),
    };
    this.tiendas.set(nombre, def);
    const tienda = new Tienda(def);
    return tienda;
  }
  transaction() {
    return new Transaccion(this);
  }
}

export function instalarIndexedDbFalso() {
  const bases = new Map();
  globalThis.indexedDB = {
    open(nombre) {
      const solicitud = { result: null, onupgradeneeded: null, onsuccess: null, onerror: null };
      tarde(() => {
        let bd = bases.get(nombre);
        if (!bd) {
          bd = new BaseFalsa();
          bases.set(nombre, bd);
          solicitud.result = bd;
          solicitud.onupgradeneeded?.();
        }
        solicitud.result = bd;
        solicitud.onsuccess?.();
      });
      return solicitud;
    },
  };
}
