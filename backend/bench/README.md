# Benchmark de TrustNode

Mide, con el pipeline real (ingesta → Chroma → recuperación → Ollama → verificación de citas → estado), cuatro cosas por configuración:

| Qué | Métrica |
|---|---|
| Precisión | `accuracy`: fracción de controles evaluables cuyo estado está en el conjunto aceptable del archivo *truth* |
| Fiabilidad de la evidencia | `bad cites`: citas que no aparecen en el texto de **su** página (PyMuPDF, independiente del pipeline); `leaks`: términos prohibidos (p. ej. "MFA") |
| Estabilidad | `stable`: mismos estados en todas las repeticiones (`--repeats 2+`) |
| Velocidad y memoria | `wall s` por auditoría, `s/call`, `gen tok/s`, carga en frío, memoria del modelo (`/api/ps`), `over ctx` (prompts que exceden `num_ctx`: Ollama los **trunca en silencio** y se pierde el prompt de reglas) |

Nada cambia los defaults de producción: cada parámetro se fija en el proceso por corrida.

## Preparar la Mac mini

```bash
bash backend/bench/setup_mac.sh llama3.1:8b qwen2.5:7b llama3.2:3b gemma3:4b
```

Instala Python 3.13, node y Ollama si faltan, crea `backend/.venv`, descarga los modelos y corre los tests offline. Python 3.15 no sirve todavía (chromadb → onnxruntime).

## Correr

```bash
cd backend
.venv/bin/python bench/run_bench.py --models llama3.1:8b,qwen2.5:7b --repeats 2
```

Cada opción acepta listas separadas por comas; se corre el producto cartesiano. La ingesta se hace una vez por configuración de embeddings/chunks/padding y se reutiliza para todos los LLM.

| Opción | Default | Para qué |
|---|---|---|
| `--models` | `llama3.1` | LLMs a comparar |
| `--embed-models` | `nomic-embed-text` | modelo de embeddings |
| `--embed-prefix` | `none` | `nomic` añade `search_document:` / `search_query:` (así se entrenó nomic) |
| `--embed-num-ctx` | (Ollama) | súbelo (p. ej. 8192) con chunks grandes: Ollama trunca el embedding en silencio |
| `--chunk-words`, `--overlap` | 500, 50 | tamaño de chunk en palabras |
| `--k` | 3 | fragmentos recuperados por check |
| `--num-ctx` | 6144 | contexto del LLM |
| `--num-predict` | (sin tope) | tope de tokens generados (las respuestas son JSON cortos) |
| `--pad-pages` | 0 | inserta el PDF real entre N páginas de relleno de otros dominios: simula PDFs grandes y mide si la recuperación y el modelo se distraen |
| `--repeats` | 1 | repeticiones por configuración (estabilidad) |
| `--truth` | `bench/truth/datagraphic_isms.json` | documento + estados esperados |
| `--verify` | `none` | `judge` añade la segunda pasada del verificador a cada check "found" (ver más abajo) |
| `--pull` | | descarga modelos que falten |
| `--keep-loaded` | | no descarga el LLM al cambiar de modelo (con 8 GB, déjalo apagado) |
| `--out` | `bench/results/<fecha>_<host>/` | carpeta de resultados |

Resultados en `bench/results/<fecha>_<host>/`: `summary.md` (tabla), `runs.jsonl` (todo), `raw/runNNN.json` (respuesta completa y cada respuesta cruda del modelo, para ver *por qué* falló un control) y `machine.json` (hardware, versión de Ollama, digest de cada modelo).

Las mismas perillas existen en producción como variables de entorno (defaults = comportamiento actual): `TRUSTNODE_MODEL`, `TRUSTNODE_EMBED_MODEL`, `TRUSTNODE_CHUNK_WORDS`, `TRUSTNODE_CHUNK_OVERLAP`, `TRUSTNODE_EMBED_DOC_PREFIX`, `TRUSTNODE_EMBED_QUERY_PREFIX`, `TRUSTNODE_EMBED_NUM_CTX`, `TRUSTNODE_EMBED_BATCH`, `TRUSTNODE_NUM_CTX`, `TRUSTNODE_NUM_PREDICT`, `TRUSTNODE_CHECK_RETRIEVAL` (`per_check_k<N>`).

## Cómo leer la tabla (`summary.md`)

| Columna | Significado |
|---|---|
| `accuracy` | controles evaluables (9 en Datagraphic) con estado dentro del conjunto aceptable; media de las repeticiones |
| `stable` | `yes` si todas las repeticiones dieron los mismos estados (`-` con una sola repetición) |
| `wrong (causa)` | controles con estado incorrecto y por qué: `model-filler` = dio por cumplido un check citando una página de relleno (falso positivo seguro); `retrieval` = check no encontrado y ningún fragmento del documento real llegó a su top-k; `model` = otro error de juicio |
| `lucky` | controles con estado correcto pero apoyados en evidencia de relleno: aciertos por suerte |
| `filler cites` | checks dados por cumplidos con citas de relleno (media). Debe ser 0 |
| `retrieval hit` | fracción de checks con al menos un fragmento del documento real en su top-k |
| `bad cites` | citas que no aparecen en el texto de su página (verificado aparte con PyMuPDF). Debe ser 0 |
| `leaks` | términos prohibidos en la salida (p. ej. "MFA", que el PDF no menciona). Debe ser 0 |
| `ingest s` | tiempo de ingesta (extracción + embeddings + Chroma) |
| `wall s` | tiempo de la auditoría completa |
| `s/call`, `gen tok/s` | segundos por llamada al LLM y tokens generados por segundo |
| `over ctx` | llamadas cuyo prompt estimado excede `num_ctx` (Ollama trunca en silencio y se pierden las reglas). Debe ser 0 |
| `mem GB` | memoria del LLM cargado según `/api/ps` |

Para decidir, el orden de importancia es: `filler cites` y `bad cites` en 0, luego `accuracy` y `stable`, y al final el tiempo.

## Línea base (para comparar en la Mac mini)

M5 Pro 24 GB, Ollama 0.40.11, `llama3.1:8b` (digest `46e0c10c039e`, el mismo modelo de producción), `nomic-embed-text`, chunks 500/50, k=3, `num_ctx` 6144, sin verificador. Tests en verde: 72 offline, 17 de integración real + 1 xfail esperado (6.2), 6 de frontend.

| Documento | accuracy | Falla (causa) | filler cites | retrieval hit | bad cites | auditoría | Fecha |
|---|---|---|---|---|---|---|---|
| PDF real (7 págs), 2 repeticiones | 8/9, estable | 6.2 (model) | 0 | 100 % | 0 | 47–63 s | 25-nov |
| 1 007 págs | 7/9 | 6.2 (model-filler), A.5.29 (retrieval) | ~5 | 68 % | 0 | ~62 s (ingesta 10 s) | 25-nov |
| 3 007 págs | 7–8/9 | A.5.29 (retrieval), 6.2 a veces | 5 | 64–68 % | 0 | ~60 s (ingesta 28 s) | 11-nov |

Comando para reproducirla en otra máquina:

```bash
.venv/bin/python bench/run_bench.py --models llama3.1:8b --pad-pages 0,1000,3000 --repeats 2
```

## Agregar otro documento

Copia `truth/datagraphic_isms.json` y cambia `pdf` (ruta relativa al JSON), `standard`, `doc_type`, `acceptable` (estados aceptables por control, **revisados por una persona**) y los términos prohibidos. Después corre con `--truth bench/truth/<nuevo>.json`. Con un solo documento no se distingue "mejoró" de "se ajustó a ese PDF".

## Plan sugerido para el fin de semana

1. **Modelos** (lo que más mueve la precisión): `--models llama3.1:8b,qwen2.5:7b,gemma3:4b,llama3.2:3b --repeats 2 --pad-pages 0,120`. Descarta los que no pasen de ~0.8 o que no sean estables.
2. **Recuperación con los 2 mejores**: `--k 3,5 --embed-prefix none,nomic --pad-pages 120`. Con PDFs grandes la recuperación es el cuello de botella (ver hallazgos abajo).
3. **Embeddings**: `--embed-models nomic-embed-text,mxbai-embed-large,bge-m3` (bge-m3 es multilingüe: importa si habrá políticas en español).
4. **Chunks**: `--chunk-words 250,500` con el mejor par de los pasos anteriores.
5. **Verificador**: `--verify none,judge` con el mejor modelo. Con un modelo mejor que el 8B el verificador podría dejar de rechazar evidencia válida.
6. **Velocidad**: `--num-predict 256` y `--num-ctx 4096,6144` sobre la mejor configuración: solo vale si la precisión no baja y `over ctx` sigue en 0.

Cada auditoría del PDF de 7 páginas hace ~30 llamadas al LLM. En una M5 Pro tardó ~1 min con llama3.1 8B; en una M1 espera ~3–4×. Calcula antes de lanzar un barrido grande: corridas × minutos.

## Cuidado al interpretar

- **Un solo documento con verdad conocida** (Datagraphic). Una configuración que gana aquí puede estar ajustada a este PDF. Agrega más archivos *truth* (mismo formato) con estados revisados por una persona antes de decidir en firme.
- **RAM de la mini**: con 8 GB, llama3.1 8B Q4 (~5.5 GB cargado con `num_ctx` 6144) + embeddings + macOS va justo; si hay swap, los tiempos no sirven. Mira `mem GB` y el Monitor de Actividad (presión de memoria). Con 16 GB no hay problema.
- **No es bit-reproducible entre máquinas**: el mismo modelo, semilla y temperatura 0 dan respuestas distintas en otra GPU. Por eso la verdad son *conjuntos* de estados y conviene `--repeats 2`.
- **Modelos con "thinking"** (p. ej. qwen3): el pipeline pide `format: json` y no desactiva el razonamiento; pueden ir lentos o fallar el JSON. Si se quieren probar, hay que añadir `think: false` al payload.
- **`--chunk-words`** solo tiene efecto si una página tiene más palabras que el tamaño de chunk: los chunks **nunca cruzan páginas** (así la página de cada cita es exacta).
- `over ctx` es una **estimación** (~4 caracteres por token).

## Primeros hallazgos (M5 Pro 24 GB, llama3.1 8B, 11-nov-2026)

| Documento | accuracy | Falla |
|---|---|---|
| PDF real (7 págs) | 8/9 | 6.2 (falso "found" conocido) |
| Mismo PDF entre 120 págs de relleno | 7/9 | 6.2 y A.5.29 |

En el PDF grande, A.5.29.c no encontró la página de continuidad: con k=3, las páginas de relleno ("…is tested every Wednesday") ganaron en la recuperación. Además, A.5.29.b aceptó una frase de la guía de marketing como "planes mantenidos". Es decir, con PDFs grandes fallan **las dos** cosas: la recuperación y el juicio del modelo.

Barrido de recuperación sobre el PDF grande (127 págs, llama3.1 8B, una repetición):

| k | prefijos nomic | accuracy | Falla |
|---|---|---|---|
| 3 | no | 7/9 | 6.2, A.5.29 |
| 5 | no | 7/9 | 4.3, A.5.29 |
| 3 | sí | 7/9 | 6.2, A.5.29 |
| 5 | sí | 6/9 | 4.3, 6.2, A.5.29 |

Ninguna perilla de recuperación lo arregla. Más fragmentos (k=5) le dan al 8B más texto para aceptar algo que no cumple (4.3 pasa a Compliant). El cuello de botella es el **juicio del modelo** (falsos "found"). Recuperar mejor ayuda solo si el modelo deja de aceptar evidencia lateral. Por eso el barrido de modelos (paso 1) es lo primero.

### Escala: 1 000 y 3 000 páginas (M5 Pro, llama3.1 8B)

| Páginas | accuracy | checks con evidencia de relleno | checks con el doc real en top-k | ingesta | auditoría |
|---|---|---|---|---|---|
| 7 | 8/9 | 0 | 100% | 0.4 s | ~1 min |
| 127 | 7/9 | — | — | 1.4 s | ~1 min |
| 1 007 | 6/9 | 5 | 68% | 9 s | ~1 min |
| 3 007 | 7/9 | 5 | 68% | 28 s | ~1 min |

- **Tiempo y memoria:** la auditoría no crece con el tamaño (siempre k fragmentos por check). Solo crece la ingesta, de forma lineal (~9 ms/página aquí). La memoria se queda en ~5.7 GB.
- **Precisión:** cae desde ~100 páginas. Hay dos causas, y la métrica las separa:
  - *retrieval*: en ~1/3 de los checks ningún fragmento del documento real llega al top-3. Esto produce falsos Partial/Non-Compliant.
  - *model-filler*: el 8B da por cumplidos ~5 checks citando relleno (p. ej. "reducir el diésel de la flota un 12%" como objetivo medible de seguridad). Esto produce falsos Compliant, que es lo más grave para un auditor.
- **`accuracy` engaña en documentos grandes:** controles como A.5.1, A.5.31 y A.6.3 salen con el estado correcto pero apoyados en relleno (`lucky`). Mira siempre `filler cites` y `lucky`.
- **No es reproducible entre procesos:** la misma configuración dio 7/9 y luego 8/9 con 3 000 páginas en dos procesos distintos.
- **El relleno es más fácil que un PDF real:** son 12 párrafos que se repiten, de otros dominios. Un manual real de 3 000 páginas tiene contenido variado y muy cercano al tema (muchas secciones de seguridad), así que la recuperación será **más difícil** que aquí. Estos números son optimistas.

### Verificador (Tarea 1, variante A de la sonda) — `--verify judge`

Segunda llamada por cada check "found": ve solo la cita y la condición y responde sí/no (texto de la sonda sin cambios). Dos repeticiones, estables:

| Documento | sin verificador | con verificador | citas de relleno aceptadas |
|---|---|---|---|
| 7 págs | 8/9 (falla 6.2) | 6/9 (arregla 6.2; rompe 5.2, A.5.2, A.5.31) | 0 → 0 |
| 1 007 págs | 7/9 | 3/9 | 5 → 2 |

- Quita la mayoría de los falsos positivos, pero rechaza evidencia válida (falsos negativos). No cumple el criterio (≥ 90 % y ≥ 90 %), igual que en la sonda (100 % / 78 %). **Queda apagado por default** (`TRUSTNODE_VERIFY=none`) y el xfail de 6.2 sigue.
- Como el verificador ve la cita sin contexto, una frase de otro dominio que coincide literalmente con la condición también pasa. Ejemplo: "refresher training … every two years" (montacargas) aceptada como formación de seguridad periódica.
- Encaja con el estado "requiere revisión humana" planeado: cuando el primer paso y el verificador no coinciden, el check se marca para revisión en lugar de decidirse.
