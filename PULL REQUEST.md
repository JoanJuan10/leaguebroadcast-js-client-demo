# Consolidated PR: fixes-changes-joan

## Contexto

Esta rama sustituye el enfoque anterior de varias ramas pequenas por una rama unica
con todos los cambios que se aplicaron primero en `WC_BBFront`.

Fuente usada para reconstruir la rama:

- Repo fuente: `C:\Repositorios\WC_BBFront`
- Rama fuente: `master`
- Commit final fuente: `4550e10 Configuracion y quitar cosas hardcodeadas`
- Rama destino: `fixes-changes-joan`
- Base destino: `main` de `LB JS Demo`

La intencion de este PR es que la revision sea manual, completa y por archivo.
Este documento describe que hace cada bloque, que archivo revisar, que riesgo tiene
y que prueba manual conviene hacer.

## Resumen ejecutivo

Este PR convierte el demo en una overlay de produccion mas configurable y con mas
superficies visuales:

- Runtime config via JSON para textos, timings, filtros de items, camaras, L-frame
  e inhibidores.
- Correcciones de role quest y ordenacion de jugadores basada en metadata de
  BlueBottle cuando existe.
- Mejoras de scoreboard: power play badges, alertas de dragon, ocultacion
  progresiva de role quests y umbrales de diferencia de oro configurables.
- Mejoras de player scoreboard: popups de level-up/item-buy, stacks de campeon,
  buffs de Baron/Elder, deteccion de muerte y localizacion de nombres de items.
- Teamfight enriquecido con Live Client fallback para items activos y orden de
  jugadores mas estable.
- Nuevos overlays: damage graph, side info page, inhibitor timers.
- Player cameras configurables: `none`, `static`, `player`, con imagen, video o
  iframe.
- L-frame configurable con branding, background por imagen/color/gradient y
  contraste automatico.
- Vite proxies para Live Client y cache local de BlueBottle.
- La documentacion de review queda concentrada en este unico archivo para no
  meter una carpeta `docs/` en el repo destino.

## Commits originales en WC_BBFront

Estos commits son la historia original de la implementacion consolidada:

| Commit | Titulo | Que aporto |
| --- | --- | --- |
| `c963e4b` | Documentacion inicial | Sirvio como referencia historica; en esta rama no se copia `docs/`, solo queda este `PULL REQUEST.md`. |
| `b8363dd` | Fix Role Detection | Logica comun de role quests, teleport top, reward ids y deteccion de botas del bot. |
| `c7555bc` | Arreglo de items, niveles y powerplays | Player scoreboard, level-ups, item buys, power play badges y branding L-frame. |
| `b422daf` | Multiples Cambios Generales | Damage graph, inhibitor timers, player cameras config, dragon alert, teamfight/liveclient, L-frame config y proxies. |
| `4af3970` | Cambios de balance, stacks y arreglos varios | Side info page, stacks de campeon, ajustes de match score y ajustes teamfight. |
| `4550e10` | Configuracion y quitar cosas hardcodeadas | `overlay.json`, `useOverlayConfig` y extraccion de textos/timings/filtros hardcodeados. |

## Guia de revision recomendada

Revisar en este orden reduce ruido:

1. `package-lock.json`, `vite.config.ts`, `public/*.json` y composables de config.
2. Helpers compartidos en `src/utils/`.
3. `src/App.vue` para confirmar layout y z-index globales.
4. Scoreboard y player scoreboard.
5. Teamfight y Live Client fallback.
6. L-frame e inhibitor timers.
7. Nuevos overlays (`DamageGraph`, `SideInfoPage`, player cameras).
8. Revisar este `PULL REQUEST.md` como documento unico de contexto.

## Archivos de configuracion y runtime

### `package-lock.json`

Que cambia:

- Actualiza `@bluebottle_gg/league-broadcast-client` de `0.3.1` a `1.0.0`
  dentro del lockfile.
- Alinea el lock con `package.json`, que ya apunta a `^1.0.0`.

Por que:

- Los cambios usan tipos y estructuras nuevas del cliente v1: side info pages,
  inhibitor data, power plays, damage graph, Live Client friendly helpers y tipos
  nuevos de scoreboard/tab/player.

Riesgo:

- Si alguien instala con un lock antiguo, los tipos y runtime pueden no coincidir.

Revision manual:

- Confirmar que `package.json` y `package-lock.json` apuntan al mismo major.
- Ejecutar `npm install` solo si el lock necesita regenerarse.

### `vite.config.ts`

Que cambia:

- Convierte el archivo al estilo usado en `WC_BBFront`.
- Anade proxies:
  - `/riot-liveclient` -> `https://127.0.0.1:2999`
  - `/bluebottle-cache` -> `http://localhost:58869/cache`
- Aplica los proxies tanto en `server` como en `preview`.

Por que:

- Evita CORS al consultar Live Client desde browser source.
- Permite acceder a cache local de BlueBottle durante desarrollo y preview.

Riesgo:

- El proxy Live Client usa `secure: false` porque Riot Live Client usa HTTPS local.
- Si el usuario no tiene el cliente de LoL abierto, esas rutas fallaran
  silenciosamente en los overlays que las usan.

Revision manual:

- Arrancar `npm run dev`.
- Comprobar que `/riot-liveclient/liveclientdata/allgamedata` responde si LoL esta abierto.
- Comprobar que `/bluebottle-cache/...` reescribe a `/cache/...`.

### `public/overlay.json`

Que contiene:

- Idioma y locale de Data Dragon.
- Textos de game info, side info, damage graph, gold graph, inhibitors,
  level-up, smite reaction y dragones.
- Config de scoreboard:
  - delay para ocultar role quests.
  - numero de jugadores que cuentan para role quests.
  - victorias necesarias por `bestOf`.
  - thresholds de diferencia de oro.
- Config de player scoreboard:
  - duracion level-up.
  - duracion item-buy.
  - coste minimo para popups de items.
  - ventana anti-duplicados.
  - patron de items excluidos.
  - stacks de campeon.
- Config de dragon alerts:
  - duracion de titulo.
  - duracion de efecto.
  - ventana anti-duplicados.
  - offset por filas de power play.
- Config de L-frame y kill feed.
- Thresholds de smite reaction.
- Listas de items relevantes/excluidos para teamfight.

Por que:

- Quita literales hardcodeados de componentes.
- Permite ajustar texto/timings sin recompilar.

Riesgo:

- Si una regex del JSON es invalida, los componentes usan fallback seguro.
- Si faltan claves, `useOverlayConfig` mezcla con defaults.

Revision manual:

- Cambiar una etiqueta, por ejemplo `text.goldGraph.title`, refrescar y verificar.
- Cambiar un timing corto y confirmar que la animacion respeta la config.

### `src/composables/useOverlayConfig.ts`

Que hace:

- Define el contrato `OverlayConfig`.
- Define `DEFAULT_OVERLAY_CONFIG`.
- Carga `/overlay.json` con `cache: no-store`.
- Mezcla config parcial con defaults.
- Normaliza numeros no negativos.
- Expone `config`, `loaded` y `loadError`.

Por que:

- Unifica configuracion transversal.
- Permite degradar si falta el JSON.

Riesgo:

- La carga es async; los componentes deben funcionar con defaults durante el
  primer render.

Revision manual:

- Borrar temporalmente una clave del JSON y confirmar fallback.
- Introducir un numero invalido en config local y comprobar que no rompe render.

### `public/lframe.json`

Que contiene:

- Config del L-frame:
  - background por `color`, `gradient`, `image`, `cacheAsset` o `css`.
  - modo de contraste.
  - rotaciones.
  - config de inhibidores.

Revision manual:

- Cambiar `background.type`.
- Cambiar `inhibitors.enabled`.
- Cambiar `inhibitors.style` entre `bar` y `text`.

### `src/composables/useLFrameConfig.ts`

Que hace:

- Carga `/lframe.json`.
- Normaliza background, contrast mode, rotaciones e inhibidores.
- Expone `config`, `loaded` y `loadError`.

Riesgo:

- La config se usa tambien para Live Client fallback de inhibidores y teamfight.
  Revisar que defaults sean conservadores.

### `public/player-cameras.json`

Que contiene:

- `mode`: `none`, `static` o `player`.
- `noneLayout`: `compact` o `expanded`.
- `rotationMs`.
- `showDeadState`.
- Fuentes estaticas por lado.
- Fuentes por jugador usando alias, display name, `alias#tag` o member id.

Revision manual:

- Probar `mode: none`.
- Probar `mode: static` con una imagen o iframe.
- Probar `mode: player` con fallback de iconos.

### `src/composables/usePlayerCameraConfig.ts`

Que hace:

- Carga `/player-cameras.json`.
- Valida modo, layout, source type, resolver y fit.
- Resuelve configuracion por jugador mediante varias claves.
- Expone:
  - `camerasEnabled`
  - `expandBottomWhenCamerasHidden`

Riesgo:

- Iframes externos dependen de permisos del proveedor.
- Videos remotos pueden necesitar `muted` para autoplay.

## Layout global

### `src/App.vue`

Que cambia:

- Anade `DamageGraph` y `SideInfoPage`.
- Usa `usePlayerCameraConfig` para expandir player scoreboard/teamfight cuando
  las camaras estan en modo `none` + `expanded`.
- Centraliza variables CSS:
  - `--side-panel-width`
  - `--player-camera-width`
  - `--overlay-z-inhibitors`
  - `--overlay-z-bottom-graphs`
  - `--overlay-z-lframe-shell`
- Corrige `left: 0x` a `left: 0px`.
- Ajusta z-index de graficas inferiores.
- Anade posicion para side info.

Por que:

- Los nuevos overlays comparten zonas de pantalla y necesitan z-index estable.
- Evita repetir magic numbers en varias clases.

Riesgo:

- Overlay 1920x1080 fija: cualquier cambio de dimensiones debe revisarse con
  OBS/browser source.

Revision manual:

- Renderizar con scoreboard, player scoreboard, teamfight, gold graph y damage
  graph activos para verificar que no se pisan.
- Probar `player-cameras.json` con `mode: none` y `noneLayout: expanded`.

## Scoreboard, objectives y dragones

### `src/components/Scoreboard/Scoreboard.vue`

Que cambia:

- Ordena jugadores con `orderScoreboardPlayersByBlueBottle`.
- Calcula role quests completas por equipo usando `isPlayerRoleQuestComplete`.
- Oculta role quests despues de `roleQuestHideDelaySeconds`.
- Anade `PowerPlayBadge` para Baron/Elder.
- Anade `DragonTakeAlert` debajo del scoreboard y lo desplaza si hay filas de
  power play.
- Usa `overlayConfig.scoreboard.*`.
- Hace cache-bust del season icon con timestamp.

Por que:

- El scoreboard ahora muestra contexto de objetivos sin depender solo de tablas.
- Role quests dejan de ocupar espacio cuando ya terminaron.

Riesgo:

- El timestamp de logo tiene un TODO para quitar cache busting temporal.
- Si BlueBottle cambia shape de `dragonPowerPlay`/`baronPowerPlay`, revisar
  `isPowerPlayActive`.

Revision manual:

- Simular power play Baron y Elder.
- Confirmar que role quests se ocultan tras completar ambos equipos.
- Confirmar que el dragon alert no tapa power play badges.

### `src/components/Scoreboard/TeamRow.vue`

Que cambia:

- Usa thresholds configurables para mostrar/ocultar diferencias de oro.

Revision manual:

- Probar diferencias de oro por debajo y por encima de thresholds.

### `src/components/Scoreboard/MatchScore.vue`

Que cambia:

- Usa `overlayConfig.scoreboard.matchScoreRequiredWins`.
- Evita hardcodear wins necesarias por best-of.

Revision manual:

- Revisar BO1, BO3, BO5 y BO7.

### `src/components/Scoreboard/TeamObjectiveRow.vue`

Que cambia:

- Usa `roleQuest.ts` para deteccion comun.
- Ya no muestra elder dragon dentro de la lista normal de dragones elementales.
- Recibe `showRoleQuests`.
- Construye slots fijos por rol, no directamente por lista mutable.

Por que:

- Evita bugs de elder duplicado y role quest incompleta por indices/stats
  inconsistentes.

Revision manual:

- Probar top teleport complete.
- Probar support/role rewards.
- Probar elder obtenido y confirmar que no aparece como dragon elemental.

### `src/components/Scoreboard/PowerPlayBadge.vue`

Que hace:

- Nuevo badge compacto para power plays activos.
- Muestra tipo (`baron` o `elder`), duracion restante y gold diff del power play.
- Soporta `mirror`.

Revision manual:

- Activar Baron para blue y red.
- Activar Elder para blue y red.
- Verificar countdown y alineacion.

### `src/components/Scoreboard/DragonTakeAlert.vue`

Que hace:

- Escucha eventos de objetivo y tambien cambios en lista de dragones del
  scoreboard.
- Normaliza dragon types: air, chemtech, earth, elder, fire, hextech, water.
- Evita duplicados con ventana configurable.
- Detecta soul cuando un equipo llega a 4 dragones elementales.
- Muestra dos fases: titulo y efecto.
- Usa textos de `overlay.json`.

Riesgo:

- Los eventos de dragon pueden llegar por WebSocket y por scoreboard; por eso hay
  deduplicacion.
- La deteccion de soul depende del conteo previo.

Revision manual:

- Capturar un dragon normal.
- Capturar cuarto elemental.
- Capturar elder.
- Confirmar que no aparecen alertas duplicadas al actualizar scoreboard.

### `src/utils/roleQuest.ts`

Que hace:

- Centraliza deteccion de role quest item.
- Distingue rewards finales.
- Trata el teleport top completo (`1220`) como completo.
- Trata boots del bot en slot 8 como recompensa de quest del bot.
- Calcula porcentaje de progreso usando stats robustos.
- Expone `isPlayerRoleQuestComplete`.

Riesgo:

- IDs de role rewards estan hardcodeados; revisar si BlueBottle/Riot cambia ids.

Revision manual:

- Probar items 1090-1095 y 1200-1250.
- Probar reward ids 1205-1209, 1220, 1221.

### `src/utils/blueBottleOrdering.ts`

Que hace:

- Ordena scoreboard players, damage entries y Live Client players usando
  `team.members` de BlueBottle cuando existe.
- Hace matching exacto y flexible por alias, display name, tag y nombres sueltos.
- Si no hay metadata de BlueBottle, conserva/fallback al orden recibido.

Revision manual:

- Probar con equipos con `members`.
- Probar sin `members`.
- Probar aliases con y sin tag.

## Player scoreboard

### `src/components/PlayerScoreboard/PlayerScoreboard.vue`

Que cambia:

- Ordena jugadores con BlueBottle metadata.
- Encola level-up notifications con duracion configurable.
- Encola item-buy notifications con:
  - coste minimo configurable.
  - regex de exclusiones configurable.
  - ventana anti-duplicados.
  - comparacion contra snapshot de inventario anterior.
- Localiza nombres de item via `getSpanishItemName`.
- Sincroniza buffs de Baron/Elder por jugador, incluso cuando `tabPlayer.hasBaron`
  o `hasElder` no viene fiable.
- Limpia estados de buff si el jugador muere.

Riesgo:

- El snapshot de inventario usa `setTimeout(0)` para dejar que el evento de
  player update procese contra el inventario anterior.
- Si el evento llega sin snapshot previo y trae muchos items, se evita mostrar
  popups para reducir falsos positivos.

Revision manual:

- Comprar item caro nuevo y confirmar popup.
- Comprar ward/potion/item excluido y confirmar que no aparece.
- Subir nivel y confirmar popup.
- Morir con Baron/Elder y confirmar que el borde desaparece.

### `src/components/PlayerScoreboard/PlayerInfo.vue`

Que cambia:

- Muestra stacks de campeon si superan min configurable.
- Formatea stacks compactos por encima de threshold.
- Muestra borde Baron/Elder/both.
- Usa muerte desde scoreboard o tab player.
- Conserva death timer y grayscale sin aplicar gris al overlay de timer.

Revision manual:

- Probar campeones con stacks.
- Probar player dead/alive.
- Probar Baron, Elder y ambos.

### `src/components/PlayerScoreboard/LevelUpNotification.vue`

Que cambia:

- Usa texto configurable (`overlayConfig.text.levelUp.label`).
- Ajusta animacion/estado visible/exiting desde queue.

Revision manual:

- Subir nivel con ambos equipos y comprobar mirror.

### `src/components/PlayerScoreboard/ItemWithCooldown.vue`

Que cambia:

- Arregla animacion/cooldown visual de items.
- Mejora tratamiento de cooldown metadata y stacks.

Revision manual:

- Probar Zhonya, GA, QSS u otros items con cooldown.
- Confirmar que el overlay de cooldown no se queda congelado.

### `src/components/PlayerScoreboard/RoleQuestSlot.vue`

Que cambia:

- Usa `roleQuest.ts`.
- Corrige indices de stats.
- Trata teleport top completo como spell/item especial.
- Mantiene borde de progreso solo si progreso < 100%.

Revision manual:

- Probar quest sin progreso, progreso parcial y completada.

### `src/composables/useNotificationQueue.ts`

Que cambia:

- Recibe duracion como `Ref<number>` para permitir config runtime.
- Mantiene control de visible/exiting por team/player.

Revision manual:

- Cambiar duraciones en `overlay.json`.

### `src/utils/itemLocalization.ts`

Que hace:

- Descarga nombres de items desde Data Dragon segun locale.
- Cachea resultados por version/locale.
- Usa fallback al displayName original si falla.

Riesgo:

- Requiere acceso a CDN de Data Dragon en runtime si no hay cache previa.

Revision manual:

- Probar con locale `es_ES`.
- Desconectar red y confirmar fallback sin romper.

## Teamfight

### `src/components/Teamfight/CompactTeamfight.vue`

Que cambia:

- Ordena damage entries por BlueBottle metadata.
- Mantiene cache de scoreboard players por equipo para fallback cuando el
  scoreboard desaparece durante teamfight.
- Poll de Live Client cuando hay teamfight y fallback habilitado.
- Ordena Live Client players por metadata o por rol.
- Pasa fallback de player/liveclient a `TeamfightPlayerEntry`.
- Mantiene stagger animation diferenciada por lado.

Riesgo:

- Live Client fallback comparte config dentro de `useLFrameConfig().config.inhibitors`
  (`liveClientFallback`, `liveClientUrl`, `liveClientPollMs`). Es funcional pero
  semanticamente podria separarse en el futuro.

Revision manual:

- Activar teamfight con datos BlueBottle completos.
- Activar teamfight con Live Client disponible.
- Confirmar orden Top/Jungle/Mid/Bot/Support.

### `src/components/Teamfight/TeamfightPlayerEntry.vue`

Que cambia:

- Intenta emparejar entry de damage graph con scoreboard player por nombre,
  displayName, champion alias y rol.
- Intenta emparejar Live Client player por riotId, summonerName, champion y rol.
- Fusiona items activos de BlueBottle y Live Client.
- Filtra consumibles, wards y slots no regulares.
- Usa listas configurables de important/excluded item ids y regex de nombres.
- Ordena items por prioridad configurable, slot e id.
- Genera fallback de asset via Data Dragon si no hay asset BlueBottle.
- Mantiene cooldown metadata si llega desde activeItems.

Riesgo:

- Matching por champion puede colisionar en casos raros, pero solo como fallback.
- Regex de items importantes vive en JSON; revisar al cambiar idioma.

Revision manual:

- Teamfight con Zhonya/GA/QSS/Solari.
- Teamfight con item activo solo presente en Live Client.
- Teamfight con consumibles/wards y confirmar que no aparecen.

### `src/components/Teamfight/liveClientTypes.ts`

Que hace:

- Define tipos ligeros para `allPlayers` y `items` del Live Client.
- Evita meter dependencia formal nueva.

Revision manual:

- Comparar shape contra payload real de `/riot-liveclient/liveclientdata/allgamedata`.

## L-frame, branding e inhibidores

### `src/components/LFrame/LFrame.vue`

Que cambia:

- Usa `useLFrameConfig`.
- Soporta backgrounds configurables.
- Usa contraste calculado para texto.
- Integra `InhibitorTimers`.
- Controla capas con variables CSS.

Revision manual:

- Probar fondo color, gradient, image y cache asset.
- Probar sponsor/game info encima del fondo.

### `src/components/LFrame/GameInfo.vue`

Que cambia:

- Usa branding de temporada/torneo.
- Usa textos configurables para fallback y patch prefix.
- Ajusta rotacion y cache de datos.

Revision manual:

- Probar con season icon/nombre disponibles.
- Probar sin season para fallback.

### `src/components/LFrame/SponsorRotation.vue`

Que cambia:

- Usa `getLFrameBranding`.
- Soporta multiples iconos de L-frame desde endpoints nuevos o recent assets.
- Usa rotacion configurable.

Revision manual:

- Probar con carpeta de assets de L-frame.
- Probar sin iconos para fallback.

### `src/components/LFrame/InhibitorTimers.vue`

Que hace:

- Nuevo overlay de timers de inhibidores dentro del L-frame.
- Consume datos nativos `gameData.inhibitors`.
- Si faltan datos, construye fallback desde eventos de objetivo/announcement.
- Si esta habilitado, puede hacer polling a Live Client para eventos de
  inhibidores.
- Normaliza lanes top/mid/bot desde enum, nombres y convenciones Riot.
- Muestra modo single team o dual team si ambos equipos tienen inhibidores caidos.
- Soporta modo visual `bar` o `text`.
- Tiene modo debug configurable.

Riesgo:

- La duracion de inhibidor esta hardcodeada a 300s.
- Los eventos Live Client pueden variar segun idioma/formato de Riot, por eso hay
  varios parsers.

Revision manual:

- Destruir inhibidor blue y red.
- Confirmar timer 5:00 y progreso.
- Confirmar que desaparece al respawn.
- Probar fallback sin `gameData.inhibitors`.
- Probar `debug: true` temporalmente.

### `src/utils/lFrameBranding.ts`

Que hace:

- Lee season actual e icono de temporada.
- Intenta endpoint `lframe/icons`.
- Si falla, busca en `display/assets/recent`.
- Normaliza paths de cache.

Riesgo:

- Depende de endpoints REST de LeagueBroadcast.

### `src/utils/lFrameBackground.ts`

Que hace:

- Convierte config de background en CSS usable.
- Soporta color, gradient, image, cache asset y CSS directo.

### `src/utils/lFrameContrast.ts`

Que hace:

- Calcula color legible sobre backgrounds.
- Permite modos de contraste para que textos/logos mantengan legibilidad.

### `public/backgroundrojo.png`

Que es:

- Asset local usado como background de L-frame.

Revision manual:

- Confirmar que el peso del PNG es aceptable para el repo.
- Confirmar que no deberia vivir en CDN/cache externa.

## Graphs y side info

### `src/components/DamageGraph/DamageGraph.vue`

Que hace:

- Nuevo overlay inferior para damage graph.
- Usa `gameData.damageGraph.damageDealt`.
- Divide por teams Order/Chaos.
- Ordena por scoreboard/BlueBottle metadata cuando existe.
- Fallback por rol y orden original si no hay metadata.
- Renderiza segmentos por tipo de dano usando colores de la libreria.
- Usa branding de L-frame para mostrar logo de torneo.
- Usa textos de `overlay.json`.

Riesgo:

- Si damage entries no traen `team`, se asume primeros 5 Order y siguientes 5
  Chaos.
- Matching por champion alias es fallback.

Revision manual:

- Probar con damage graph completo.
- Probar sin team en entries.
- Confirmar leyenda fisico/magico/true.

### `src/components/GoldGraph/GoldGraph.vue`

Que cambia:

- Titulo configurable via `overlay.json`.
- Pequenos ajustes para convivir con damage graph.

Revision manual:

- Confirmar que gold graph sigue apareciendo cuando corresponde.

### `src/components/SideInfo/SideInfoPage.vue`

Que hace:

- Nuevo overlay lateral para paginas de side info.
- Soporta tipos:
  - Gold
  - Experience
  - Damage
  - CreepScore
  - RoleQuest
  - TowerPlatings
- Ordena filas por valor descendente.
- Para Experience intenta reconstruir nivel y progreso desde tabs/scoreboard.
- Respeta `display.showHero` y `display.showBar`.
- Usa nombres/iconos de campeon y colores por equipo.

Riesgo:

- Experience combina varias fuentes porque el payload puede no traer nivel
  directamente.

Revision manual:

- Lanzar cada tipo de side info page desde LeagueBroadcast/Swagger.
- Confirmar barras, nombres, icons, valores y orden.

## Player cameras

### `src/components/PlayerCameras/PlayerCameras.vue`

Que cambia:

- Usa `usePlayerCameraConfig`.
- Oculta todo el contenedor si `mode: none`.
- Pasa `side="left"` y `side="right"` a cada camara.
- Usa `--player-camera-width`.

Revision manual:

- Probar con y sin scoreboard/teamfight.
- Probar modo none.

### `src/components/PlayerCameras/PlayerCamera.vue`

Que cambia:

- Soporta sources:
  - image
  - video
  - iframe
- Soporta resolver `url`, `cache` y prefijo `cache:`.
- En modo player, rota jugadores con `rotationMs`.
- Precarga imagenes antes de rotar.
- Muestra label configurable o displayName/alias.
- Aplica grayscale al jugador muerto solo en modo player si `showDeadState`.
- Cancela intervalos/watchers al desmontar.

Riesgo:

- Iframe externo puede tener restricciones.
- Videos remotos pueden necesitar CORS/autoplay.

Revision manual:

- Probar fuente iframe tipo VDO.Ninja.
- Probar fuente image cache.
- Probar fuente video.
- Matar jugador y confirmar grayscale.

## Kill feed y smite reaction

### `src/components/KillFeed/KillFeed.vue`

Que cambia:

- Usa config runtime:
  - `maxEntries`
  - `displayDurationMs`
  - `staggerStepMs`
  - `batchResetMs`

Revision manual:

- Generar varias kills seguidas.
- Confirmar max entries y stagger.

### `src/components/SmiteReaction/SmiteReaction.vue`

Que cambia:

- Usa textos y thresholds configurables.
- Mantiene categorias early/perfect/great/average/slow.

Revision manual:

- Probar smite secured y missed.
- Probar thresholds cambiados en JSON.

## Documentacion incluida

No se anade carpeta `docs/` ni se reescribe el `README.md`.

La documentacion incluida en esta rama es este unico archivo:

- `PULL REQUEST.md`

Motivo:

- Los devs necesitan contexto de review, no una documentacion de producto nueva
  dentro del repo.
- Evita ruido en el diff.
- Mantiene toda la explicacion de cambios, riesgos y pruebas en un sitio facil de
  leer desde la PR.

## Lista completa de archivos nuevos

- `PULL REQUEST.md`
- `public/backgroundrojo.png`
- `public/lframe.json`
- `public/overlay.json`
- `public/player-cameras.json`
- `src/components/DamageGraph/DamageGraph.vue`
- `src/components/LFrame/InhibitorTimers.vue`
- `src/components/Scoreboard/DragonTakeAlert.vue`
- `src/components/Scoreboard/PowerPlayBadge.vue`
- `src/components/SideInfo/SideInfoPage.vue`
- `src/components/Teamfight/liveClientTypes.ts`
- `src/composables/useLFrameConfig.ts`
- `src/composables/useOverlayConfig.ts`
- `src/composables/usePlayerCameraConfig.ts`
- `src/utils/blueBottleOrdering.ts`
- `src/utils/itemLocalization.ts`
- `src/utils/lFrameBackground.ts`
- `src/utils/lFrameBranding.ts`
- `src/utils/lFrameContrast.ts`
- `src/utils/roleQuest.ts`

## Lista completa de archivos modificados

- `package-lock.json`
- `src/App.vue`
- `src/components/GoldGraph/GoldGraph.vue`
- `src/components/KillFeed/KillFeed.vue`
- `src/components/LFrame/GameInfo.vue`
- `src/components/LFrame/LFrame.vue`
- `src/components/LFrame/SponsorRotation.vue`
- `src/components/PlayerCameras/PlayerCamera.vue`
- `src/components/PlayerCameras/PlayerCameras.vue`
- `src/components/PlayerScoreboard/ItemWithCooldown.vue`
- `src/components/PlayerScoreboard/LevelUpNotification.vue`
- `src/components/PlayerScoreboard/PlayerInfo.vue`
- `src/components/PlayerScoreboard/PlayerScoreboard.vue`
- `src/components/PlayerScoreboard/RoleQuestSlot.vue`
- `src/components/Scoreboard/MatchScore.vue`
- `src/components/Scoreboard/Scoreboard.vue`
- `src/components/Scoreboard/TeamObjectiveRow.vue`
- `src/components/Scoreboard/TeamRow.vue`
- `src/components/SmiteReaction/SmiteReaction.vue`
- `src/components/Teamfight/CompactTeamfight.vue`
- `src/components/Teamfight/TeamfightPlayerEntry.vue`
- `src/composables/useNotificationQueue.ts`
- `vite.config.ts`

## Checklist funcional recomendado

### Build y arranque

- `npm install`
- `npm run type-check`
- `npm run build`
- `npm run dev`

### Revision visual base

- Abrir overlay en 1920x1080.
- Confirmar fondo transparente.
- Confirmar que scoreboard, player scoreboard, L-frame, minimap y timers siguen
  en sus posiciones.

### Scoreboard

- Scoreboard aparece/desaparece con transiciones.
- Role quests muestran progreso por rol.
- Role quests se ocultan tras completar ambos equipos y esperar el delay.
- Elder no se lista como dragon elemental normal.
- Power play badges aparecen para Baron/Elder.
- Dragon alert aparece para dragon normal, soul y elder.

### Player scoreboard

- Level-up popup por jugador y equipo.
- Item-buy popup solo para items relevantes.
- No se muestran wards, recall, quest o consumibles excluidos.
- Stacks de campeon aparecen si superan threshold.
- Baron/Elder border se muestra solo si el jugador vive.
- Death timer y grayscale correctos.

### Teamfight

- Teamfight aparece con cinco entradas por equipo.
- Orden de jugadores coincide con BlueBottle metadata o rol.
- Items activos importantes aparecen.
- Items de Live Client aparecen cuando BlueBottle no los trae.
- Consumibles/wards no aparecen.

### L-frame

- Game info rota.
- Sponsor rotation rota.
- Fondo configurable se aplica.
- Contraste de texto es legible.
- Inhibitor timers aparecen con datos nativos, fallback de eventos y Live Client
  fallback si procede.

### Nuevos overlays

- Damage graph aparece con damage data y segmentos por tipo.
- Side info page aparece para gold, experience, damage, CS, role quest y plates.
- Player cameras funcionan en `none`, `static` y `player`.

### Config runtime

- Cambiar texto en `public/overlay.json` y refrescar.
- Cambiar duracion de item-buy/level-up.
- Cambiar thresholds de smite reaction.
- Cambiar `player-cameras.json`.
- Cambiar `lframe.json`.

## Riesgos conocidos / cosas a decidir en review

- `public/backgroundrojo.png` es un binario grande; decidir si debe vivir en repo.
- `Scoreboard.vue` conserva un TODO de cache busting para season icon.
- Teamfight usa config de Live Client dentro de `lFrame.inhibitors`; funciona,
  pero seria mas limpio separarlo si se quiere una config semantica perfecta.
- Matching por champion alias es fallback y puede colisionar si el payload llega
  incompleto.
- La duracion de inhibidores esta fijada a 300s.
- Los textos/locales estan en espanol; validar si se quiere mantener idioma por
  defecto o documentar cambio.

## Notas para reviewers

- Este PR esta pensado para revision por areas, no por commit.
- Los helpers compartidos (`useOverlayConfig`, `useLFrameConfig`,
  `blueBottleOrdering`, `roleQuest`, `itemLocalization`) son los puntos con mas
  impacto transversal.
- Los componentes nuevos se ocultan cuando no hay datos; revisar tanto estado con
  datos como estado sin datos.
- Los fallbacks de Live Client son defensivos: si no hay respuesta, la overlay no
  deberia romper.
