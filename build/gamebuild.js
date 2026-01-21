/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/Console.js"
/*!************************!*\
  !*** ./src/Console.js ***!
  \************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

eval("{__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   \"default\": () => (__WEBPACK_DEFAULT_EXPORT__)\n/* harmony export */ });\ndocument.addEventListener('keydown', function (e) {\n  if (e.keyCode === 192) {\n    openClose();\n    e.preventDefault();\n  }\n});\nvar isOpen = false;\nvar el = document.getElementById('console');\nvar elContent = document.getElementById('console-content');\nvar elInput = document.getElementById('console-input');\nvar html = elContent.innerHTML;\nelInput.addEventListener('keydown', function (e) {\n  if (e.keyCode === 13) {\n    e.preventDefault();\n    var text = elInput.value.trim();\n    Console.writeText(text);\n    if (text.indexOf('map ') === 0) {\n      document.location.href = \"?mapfile=\" + text.substring(4);\n    } else if (text === 'help') {\n      Console.writeText('Available commands:');\n      Console.writeText('help');\n      Console.writeText('map <mapname>');\n    }\n    elInput.value = '';\n  }\n});\nfunction openClose() {\n  isOpen = !isOpen;\n  if (isOpen) {\n    el.classList.add('open');\n    elContent.scrollTop = elContent.scrollHeight;\n    elInput.value = '';\n    elInput.focus();\n  } else {\n    el.classList.remove('open');\n  }\n}\nfunction htmlescape(html) {\n  return html.replace(/&/g, '&amp;').replace(/>/g, '&gt;').replace(/</g, '&lt;').replace(/\"/g, '&quot;');\n}\nvar Console = {\n  writeText: function writeText(addText) {\n    html += '<br>' + htmlescape(addText);\n    if (html.length > 5000) {\n      html = html.substring(html.length - 5000);\n    }\n    elContent.innerHTML = html;\n    elContent.scrollTop = elContent.scrollHeight;\n  }\n};\n/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (Console);\n\n//# sourceURL=webpack://nfk-web/./src/Console.js?\n}");

/***/ },

/***/ "./src/Constants.js"
/*!**************************!*\
  !*** ./src/Constants.js ***!
  \**************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

eval("{__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   \"default\": () => (__WEBPACK_DEFAULT_EXPORT__)\n/* harmony export */ });\n/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = ({\n  BRICK_WIDTH: 32,\n  BRICK_HEIGHT: 16,\n  PLAYER_MAX_VELOCITY_X: 3\n});\n\n//# sourceURL=webpack://nfk-web/./src/Constants.js?\n}");

/***/ },

/***/ "./src/Keyboard.js"
/*!*************************!*\
  !*** ./src/Keyboard.js ***!
  \*************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

eval("{__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   \"default\": () => (__WEBPACK_DEFAULT_EXPORT__)\n/* harmony export */ });\nvar keysState = {\n  keyUp: false,\n  keyDown: false,\n  keyLeft: false,\n  keyRight: false\n};\ndocument.addEventListener('keydown', function (e) {\n  if (e.keyCode < 37 || e.keyCode > 40) {\n    return;\n  }\n  if (e.target.nodeName.toLowerCase() !== 'textarea') {\n    e.preventDefault();\n    switch (e.keyCode) {\n      case 38:\n        keysState.keyUp = true;\n        break;\n      case 37:\n        keysState.keyLeft = true;\n        break;\n      case 39:\n        keysState.keyRight = true;\n        break;\n      case 40:\n        keysState.keyDown = true;\n        break;\n    }\n  }\n});\ndocument.addEventListener('keyup', function (e) {\n  if (e.keyCode < 37 || e.keyCode > 40) {\n    return;\n  }\n  if (e.target.nodeName.toLowerCase() !== 'textarea') {\n    e.preventDefault();\n    switch (e.keyCode) {\n      case 38:\n        keysState.keyUp = false;\n        break;\n      case 37:\n        keysState.keyLeft = false;\n        break;\n      case 39:\n        keysState.keyRight = false;\n        break;\n      case 40:\n        keysState.keyDown = false;\n        break;\n    }\n  }\n});\n/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (keysState);\n\n//# sourceURL=webpack://nfk-web/./src/Keyboard.js?\n}");

/***/ },

/***/ "./src/Map.js"
/*!********************!*\
  !*** ./src/Map.js ***!
  \********************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

eval("{__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   \"default\": () => (__WEBPACK_DEFAULT_EXPORT__)\n/* harmony export */ });\n/* harmony import */ var _MapEditor_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./MapEditor.js */ \"./src/MapEditor.js\");\n/* harmony import */ var _Constants_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./Constants.js */ \"./src/Constants.js\");\n/* harmony import */ var _Console_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./Console.js */ \"./src/Console.js\");\n\n\n\nvar rows = 0;\nvar cols = 0;\nvar bricks = [];\nvar respawns = [];\nfunction parseMapText(mapText) {\n  var lines = mapText.replace(\"\\r\", '').split(\"\\n\");\n  rows = lines.length;\n  //Determine max cols trough all rows\n  for (row = 0; row < rows; row++) {\n    if (lines[row] !== undefined && cols < lines[row].length) {\n      cols = lines[row].length;\n    }\n  }\n  bricks = [];\n  var row, col, _char;\n  for (row = 0; row < rows; row++) {\n    bricks[row] = [];\n    for (col = 0; col < cols; col++) {\n      if (lines[row] !== undefined || lines[row][col] !== undefined) {\n        _char = lines[row][col];\n      } else {\n        _char = ' ';\n      }\n      bricks[row][col] = _char === '0';\n      if (_char === 'R') {\n        respawns.push({\n          row: row,\n          col: col\n        });\n      }\n    }\n  }\n}\n/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = ({\n  loadFromQuery: function loadFromQuery() {\n    var mapText;\n    //loock if any map name is in query string?\n    var queryString = window.location.href.slice(window.location.href.indexOf('?') + 1);\n    if (queryString.indexOf('maptext=') === 0) {\n      mapText = decodeURIComponent(queryString.substring(8)).replace(/\\+/g, ' ');\n      _MapEditor_js__WEBPACK_IMPORTED_MODULE_0__[\"default\"].show();\n      _Console_js__WEBPACK_IMPORTED_MODULE_2__[\"default\"].writeText('ma                                                                                                                         p loaded from url');\n    } else {\n      var mapfile;\n      if (queryString.indexOf('mapfile=') === 0) {\n        mapfile = queryString.substring(8) + '.txt';\n      } else {\n        mapfile = 'dm2.txt';\n      }\n      var xmlhttp = new XMLHttpRequest();\n      xmlhttp.open('GET', 'maps/' + mapfile, false);\n      xmlhttp.send(null);\n      mapText = xmlhttp.responseText;\n      _Console_js__WEBPACK_IMPORTED_MODULE_2__[\"default\"].writeText('map loaded: ' + mapfile);\n    }\n    _MapEditor_js__WEBPACK_IMPORTED_MODULE_0__[\"default\"].setContent(mapText);\n    parseMapText(mapText);\n  },\n  isBrick: function isBrick(col, row) {\n    return row >= rows || col >= cols || row < 0 || col < 0 || bricks[row][col];\n  },\n  getRows: function getRows() {\n    return rows;\n  },\n  getCols: function getCols() {\n    return cols;\n  },\n  getRandomRespawn: function getRandomRespawn() {\n    return respawns[Math.floor(Math.random() * respawns.length)];\n  }\n});\n\n//# sourceURL=webpack://nfk-web/./src/Map.js?\n}");

/***/ },

/***/ "./src/MapEditor.js"
/*!**************************!*\
  !*** ./src/MapEditor.js ***!
  \**************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

eval("{__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   \"default\": () => (__WEBPACK_DEFAULT_EXPORT__)\n/* harmony export */ });\nvar mapEditorForm = document.getElementById('mapeditor');\nvar showMapEditorLink = document.getElementById('mapeditor-link');\nvar maptextarea = document.getElementById('maptext');\nvar showurl = document.getElementById('shorturl');\nshowMapEditorLink.addEventListener('click', function (e) {\n  e.preventDefault();\n  MapEditor.show();\n});\ndocument.getElementById('short-link').addEventListener('click', function (e) {\n  e.preventDefault();\n  var xmlhttp = new XMLHttpRequest();\n  xmlhttp.open('GET', 'map.php?maptext=' + encodeURIComponent(maptextarea.value), false);\n  xmlhttp.send(null);\n  showurl.value = 'http://nfk.pqr.su/game/map.php?mapid=' + xmlhttp.responseText;\n});\nvar MapEditor = {\n  show: function show() {\n    mapEditorForm.style.display = \"block\";\n    showMapEditorLink.style.display = \"none\";\n  },\n  setContent: function setContent(maptext) {\n    maptextarea.value = maptext;\n  }\n};\n/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (MapEditor);\n\n//# sourceURL=webpack://nfk-web/./src/MapEditor.js?\n}");

/***/ },

/***/ "./src/Physics.js"
/*!************************!*\
  !*** ./src/Physics.js ***!
  \************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

eval("{__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   updateGame: () => (/* binding */ updateGame)\n/* harmony export */ });\n/* harmony import */ var _Constants_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./Constants.js */ \"./src/Constants.js\");\n/* harmony import */ var _Sound_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./Sound.js */ \"./src/Sound.js\");\n/* harmony import */ var _Map_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./Map.js */ \"./src/Map.js\");\n/* harmony import */ var _Utils_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./Utils.js */ \"./src/Utils.js\");\n/* harmony import */ var _Console_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./Console.js */ \"./src/Console.js\");\n\n\n\n\n\n\n//Вынесем константы из объекта Constants в отедельные константы, чтобы не писать везде Constants.<название_константы>\nvar PLAYER_MAX_VELOCITY_X = _Constants_js__WEBPACK_IMPORTED_MODULE_0__[\"default\"].PLAYER_MAX_VELOCITY_X;\n\n//Вынесем указатель на функцию в отедельную переменную, чтобы не писать везде Map.isBrick(...)\nvar isBrick = _Map_js__WEBPACK_IMPORTED_MODULE_2__[\"default\"].isBrick;\nvar trunc = _Utils_js__WEBPACK_IMPORTED_MODULE_3__[\"default\"].trunc;\nvar defx = 0;\nvar defy = 0;\nvar tmpCol = 0;\nvar tmpY = 0;\nvar tmpSpeedX = 0;\nfunction playerphysic(player) {\n  // --!-!-!=!=!= ULTIMATE 3d[Power]'s PHYSIX M0DEL =!=!=!-!-!--\n\n  defx = player.x;\n  defy = player.y;\n  player.velocityY = player.velocityY + 0.056;\n  if (player.velocityY > -1 && player.velocityY < 0) {\n    player.velocityY /= 1.11; // progressive inertia\n  }\n  if (player.velocityY > 0 && player.velocityY < 5) {\n    player.velocityY *= 1.1; // progressive inertia\n  }\n  if (player.velocityX < -0.2 || player.velocityX > 0.2) {\n    if (player.keyLeft === player.keyRight) {\n      //No active key left/right pressed\n      if (player.isOnGround()) {\n        player.velocityX /= 1.14; // ongroud stop speed.\n      } else {\n        player.velocityX /= 1.025; // inair stopspeed.\n      }\n    }\n  } else {\n    //completelly stop if velocityX less then 0.2\n    player.velocityX = 0;\n  }\n  if (player.velocityX !== 0) {\n    tmpSpeedX = (player.velocityX < 0 ? -1 : 1) * velocityXSpeedJump[player.speedJump];\n  } else {\n    tmpSpeedX = 0;\n  }\n  player.setXY(player.x + player.velocityX + tmpSpeedX, player.y + player.velocityY);\n\n  // wall CLIPPING\n  if (player.crouch) {\n    //VERTICAL CHECNING WHEN CROUCH FIRST\n    if (player.isOnGround() && (player.isBrickCrouchOnHead() || player.velocityY > 0)) {\n      player.velocityY = 0;\n      player.setY(trunc(Math.round(player.y) / 16) * 16 + 8);\n    } else if (player.isBrickCrouchOnHead() && player.velocityY < 0) {\n      // fly up\n      player.velocityY = 0;\n      player.doublejumpCountdown = 3;\n      player.setY(trunc(Math.round(player.y) / 16) * 16 + 8);\n    }\n  }\n\n  // HORZ CHECK\n  if (player.velocityX != 0) {\n    tmpCol = trunc(Math.round(defx + (player.velocityX < 0 ? -11 : 11)) / 32);\n    tmpY = player.crouch ? player.y : defy;\n    if (isBrick(tmpCol, trunc(Math.round(tmpY - (player.crouch ? 8 : 16)) / 16)) || isBrick(tmpCol, trunc(Math.round(tmpY) / 16)) || isBrick(tmpCol, trunc(Math.round(tmpY + 16) / 16))) {\n      player.setX(trunc(defx / 32) * 32 + (player.velocityX < 0 ? 9 : 22));\n      player.velocityX = 0;\n      player.speedJump = 0;\n      if (defx != player.x) {\n        log('wall', player);\n      }\n    }\n  }\n\n  //Vertical check again after x change\n  if (player.isOnGround() && (player.isBrickOnHead() || player.velocityY > 0)) {\n    player.velocityY = 0;\n    player.setY(trunc(Math.round(player.y) / 16) * 16 + 8);\n  } else if (player.isBrickOnHead() && player.velocityY < 0) {\n    // fly up\n    player.velocityY = 0;\n    player.doublejumpCountdown = 3;\n  }\n  if (player.velocityX < -5) player.velocityX = -5;\n  if (player.velocityX > 5) player.velocityX = 5;\n  if (player.velocityY < -5) player.velocityY = -5;\n  if (player.velocityY > 5) player.velocityY = 5;\n}\nvar tmpAbsMaxVelocityX = 0;\nvar tmpSign = 0;\nvar velocityYSpeedJump = [0, 0, 0.4, 0.8, 1.0, 1.2, 1.4];\nvar velocityXSpeedJump = [0, 0.33, 0.8, 1.1, 1.4, 1.8, 2.2];\nvar tmpLastWasJump = false;\nvar tmpCurJump = false;\nvar speedJumpDirection = 0;\nvar tmpLastKeyUp = false;\nvar tmpDjBonus = 0;\nfunction playermove(player) {\n  playerphysic(player);\n  if (player.doublejumpCountdown > 0) {\n    player.doublejumpCountdown--;\n  }\n  if (player.isOnGround()) {\n    player.velocityY = 0; // really nice thing :)\n  }\n  tmpCurJump = false;\n  if (player.speedJump > 0 && (player.keyUp !== tmpLastKeyUp || player.keyLeft && speedJumpDirection !== -1 || player.keyRight && speedJumpDirection !== 1)) {\n    player.speedJump = 0;\n    log('sj 0 - change keys', player);\n  }\n  tmpLastKeyUp = player.keyUp;\n  if (player.keyUp) {\n    // JUMP!\n    if (player.isOnGround() && !player.isBrickOnHead() && !tmpLastWasJump) {\n      if (player.doublejumpCountdown > 4 && player.doublejumpCountdown < 11) {\n        // double jumpz\n        player.doublejumpCountdown = 14;\n        player.velocityY = -3;\n        if (player.velocityX !== 0) {\n          tmpSpeedX = Math.abs(player.velocityX) + velocityXSpeedJump[player.speedJump];\n        } else {\n          tmpSpeedX = 0;\n        }\n        if (tmpSpeedX > 3) {\n          tmpDjBonus = tmpSpeedX - 3;\n          player.velocityY -= tmpDjBonus;\n          log('dj higher (bonus +' + round(tmpDjBonus) + ')', player);\n        } else {\n          log('dj standart', player);\n        }\n        player.crouch = false;\n        _Sound_js__WEBPACK_IMPORTED_MODULE_1__[\"default\"].jump();\n\n        //player.velocityY += velocityYSpeedJump[player.speedJump];\n      } else {\n        if (player.doublejumpCountdown === 0) {\n          player.doublejumpCountdown = 14;\n          _Sound_js__WEBPACK_IMPORTED_MODULE_1__[\"default\"].jump();\n        }\n        player.velocityY = -2.9;\n        player.velocityY += velocityYSpeedJump[player.speedJump];\n        log('jump', player);\n        if (player.speedJump < 6 && !tmpLastWasJump && player.keyLeft !== player.keyRight) {\n          speedJumpDirection = player.keyLeft ? -1 : 1;\n          player.speedJump++;\n          log('increase sj', player);\n        }\n      }\n      tmpCurJump = true;\n    }\n  } else {\n    if (player.isOnGround() && player.speedJump > 0 && !player.keyDown) {\n      player.speedJump = 0;\n      log('sj 0 - on ground', player);\n    }\n  }\n\n  // CROUCH\n  if (!player.keyUp && player.keyDown) {\n    if (player.isOnGround()) {\n      player.crouch = true;\n    } else if (!player.isBrickCrouchOnHead()) {\n      player.crouch = false;\n    }\n  } else {\n    player.crouch = player.isOnGround() && player.isBrickCrouchOnHead();\n  }\n  tmpLastWasJump = tmpCurJump;\n  if (player.keyLeft !== player.keyRight) {\n    //One of the keys pressed - left or right, starting calculation\n    tmpAbsMaxVelocityX = PLAYER_MAX_VELOCITY_X;\n    if (player.crouch) {\n      tmpAbsMaxVelocityX--;\n    }\n\n    //While moving left - speed should be negative value\n    tmpSign = player.keyLeft ? -1 : 1;\n    if (player.velocityX * tmpSign < 0) {\n      //We are currently moving in opposite direction\n      //So we make a fast turn with 0.8 acceleration\n      player.velocityX += tmpSign * 0.8;\n    }\n    var absVelocityX = Math.abs(player.velocityX);\n    if (absVelocityX < tmpAbsMaxVelocityX) {\n      //We are not at the maximum speed yet, continue acceleration\n      player.velocityX += tmpSign * 0.35;\n    } else if (absVelocityX > tmpAbsMaxVelocityX) {\n      //Somehow we are out of the speed limit. Let's limit it!\n      player.velocityX = tmpSign * tmpAbsMaxVelocityX;\n    }\n  }\n}\nfunction runPhysicsOneFrame(player) {\n  //Стратегия расчёта физики следующая:\n  //Используя текущие значения скорости (расчитанные в предыдущем кадре) сделаем перемещение игрока\n  //Проверим столкновения со стенами, сделаем корректировку позиции игрока, если он провалился внутрь какой-нибудь стены\n  //Перед обновлением позиции игрока запомним старые значения колонки\n  playermove(player);\n}\nvar time = 0;\nvar tmpDeltaTime = 0;\nvar tmpDeltaPhysicFrames = 0;\nfunction updateGame(player, timestamp) {\n  if (time === 0) {\n    //Это первый запуск функции, начальное время игры ещё не было установлено\n    //Установим это время на 16мс назад, чтобы просчитать физику одного физического фрейма\n    time = timestamp - 16;\n  }\n\n  //Физика основана на константах из NFK\n  //В NFK физика была привзяна к FPS=50, поэтому вск константы были из расчёта FPS=50\n  //В новой реализации физика не должна быть привязана к FPS выдаваемому компьютером, а будет привязана к времени\n  //Сделаем расчёт исходя из 60 FPS (т.е. игра будет чуть быстрее, чем оригинальная): 1сек/60 = 16мили секунд\n  //Чтобы сохранить все старые константы, почитаем какое перемещение нужно сделать за реально прошедшее время deltaTime?\n  tmpDeltaTime = timestamp - time;\n  //Назовём 20милисекундный интервал \"физическим фреймом\"\n  //Посчитаем, сколько физических фреймов прошло за delltaTime?\n  tmpDeltaPhysicFrames = trunc(tmpDeltaTime / 16);\n  if (tmpDeltaPhysicFrames === 0) {\n    //Ещё не накопилось достаточно времени, чтобы начёт расчёт хотя бы одного физического фрейма!\n    //Прерываем выполнение функции\n    return false;\n  }\n\n  //Сдвинем указатель time вперёд на нужно число физических фреймов для следующей итерации\n  time += tmpDeltaPhysicFrames * 16.6;\n\n  //Есть один или несколько физических фреймов, которые нужно общитать в физической модели, сделаем это в цикле\n  if (tmpDeltaPhysicFrames === 1) {\n    //В большинстве случаев фрейм будет ровно один, так что для производительности рассмотрим этот вариант отдельно\n    runPhysicsOneFrame(player);\n  } else {\n    //Нужно сделать несколько перемещений в цикле\n    while (tmpDeltaPhysicFrames > 0) {\n      runPhysicsOneFrame(player);\n      tmpDeltaPhysicFrames--;\n    }\n  }\n}\nvar logLine = 0;\nvar textarea = document.getElementById('log');\nvar newText = '';\nfunction log(text, player) {\n  logLine++;\n  if (player.velocityX !== 0) {\n    tmpSpeedX = (player.velocityX < 0 ? -1 : 1) * velocityXSpeedJump[player.speedJump];\n  } else {\n    tmpSpeedX = 0;\n  }\n  newText = logLine + ' ' + text + ' (x: ' + round(player.x) + ', y: ' + round(player.y) + ', dx: ' + round(tmpSpeedX) + ', dy: ' + round(player.velocityY) + ', sj: ' + player.speedJump + ')';\n  textarea.value = newText + \"\\n\" + textarea.value.substring(0, 1000);\n  _Console_js__WEBPACK_IMPORTED_MODULE_4__[\"default\"].writeText(newText);\n}\nfunction round(val) {\n  return trunc(val) + '.' + Math.abs(trunc(val * 10) - trunc(val) * 10);\n}\n\n//# sourceURL=webpack://nfk-web/./src/Physics.js?\n}");

/***/ },

/***/ "./src/Player.js"
/*!***********************!*\
  !*** ./src/Player.js ***!
  \***********************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

eval("{__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   \"default\": () => (/* binding */ Player)\n/* harmony export */ });\n/* harmony import */ var _Map_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./Map.js */ \"./src/Map.js\");\n/* harmony import */ var _Utils_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./Utils.js */ \"./src/Utils.js\");\n/* harmony import */ var _Constants_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./Constants.js */ \"./src/Constants.js\");\nfunction _typeof(o) { \"@babel/helpers - typeof\"; return _typeof = \"function\" == typeof Symbol && \"symbol\" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && \"function\" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? \"symbol\" : typeof o; }, _typeof(o); }\nfunction _classCallCheck(a, n) { if (!(a instanceof n)) throw new TypeError(\"Cannot call a class as a function\"); }\nfunction _defineProperties(e, r) { for (var t = 0; t < r.length; t++) { var o = r[t]; o.enumerable = o.enumerable || !1, o.configurable = !0, \"value\" in o && (o.writable = !0), Object.defineProperty(e, _toPropertyKey(o.key), o); } }\nfunction _createClass(e, r, t) { return r && _defineProperties(e.prototype, r), t && _defineProperties(e, t), Object.defineProperty(e, \"prototype\", { writable: !1 }), e; }\nfunction _toPropertyKey(t) { var i = _toPrimitive(t, \"string\"); return \"symbol\" == _typeof(i) ? i : i + \"\"; }\nfunction _toPrimitive(t, r) { if (\"object\" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || \"default\"); if (\"object\" != _typeof(i)) return i; throw new TypeError(\"@@toPrimitive must return a primitive value.\"); } return (\"string\" === r ? String : Number)(t); }\n\n\n\nvar isBrick = _Map_js__WEBPACK_IMPORTED_MODULE_0__[\"default\"].isBrick;\nvar trunc = _Utils_js__WEBPACK_IMPORTED_MODULE_1__[\"default\"].trunc;\nvar Player = /*#__PURE__*/function () {\n  function Player() {\n    _classCallCheck(this, Player);\n    this.x = 0.0;\n    this.y = 0.0;\n    this.velocityX = 0.0;\n    this.velocityY = 0.0;\n\n    //Current state of pressed keys\n    this.keyUp = false;\n    this.keyDown = false;\n    this.keyLeft = false;\n    this.keyRight = false;\n    this.crouch = false; //current crouch state\n\n    this.doublejumpCountdown = 0;\n    this.cacheOnGround = false;\n    this.cacheBrickOnHead = false;\n    this.cacheBrickCrouchOnHead = false;\n    this.speedJump = 0;\n  }\n  return _createClass(Player, [{\n    key: \"setX\",\n    value: function setX(newX) {\n      if (newX != this.x) {\n        this.x = newX;\n        this.updateCaches();\n      }\n    }\n  }, {\n    key: \"setY\",\n    value: function setY(newY) {\n      if (newY != this.y) {\n        this.y = newY;\n        this.updateCaches();\n      }\n    }\n  }, {\n    key: \"setXY\",\n    value: function setXY(newX, newY) {\n      if (newX !== this.x || newY !== this.y) {\n        this.x = newX;\n        this.y = newY;\n        this.updateCaches();\n      }\n    }\n  }, {\n    key: \"updateCaches\",\n    value: function updateCaches() {\n      this.updateCacheOnGround();\n      this.updateCacheBrickOnHead();\n      this.updateCacheBrickCrouchOnHead();\n    }\n  }, {\n    key: \"updateCacheOnGround\",\n    value: function updateCacheOnGround() {\n      this.cacheOnGround = isBrick(trunc((this.x - 9) / 32), trunc((this.y + 25) / 16)) && !isBrick(trunc((this.x - 9) / 32), trunc((this.y + 23) / 16)) || isBrick(trunc(trunc(this.x + 9) / 32), trunc(trunc(this.y + 25) / 16)) && !isBrick(trunc(trunc(this.x + 9) / 32), trunc(trunc(this.y + 23) / 16)) || isBrick(trunc((this.x - 9) / 32), trunc((this.y + 24) / 16)) && !isBrick(trunc((this.x - 9) / 32), trunc((this.y + 8) / 16)) || isBrick(trunc((this.x + 9) / 32), trunc((this.y + 24) / 16)) && !isBrick(trunc((this.x + 9) / 32), trunc((this.y + 8) / 16));\n    }\n  }, {\n    key: \"updateCacheBrickCrouchOnHead\",\n    value: function updateCacheBrickCrouchOnHead() {\n      this.cacheBrickCrouchOnHead = isBrick(trunc((this.x - 8) / 32), trunc((this.y - 9) / 16)) && !isBrick(trunc((this.x - 8) / 32), trunc((this.y - 7) / 16)) || isBrick(trunc((this.x + 8) / 32), trunc((this.y - 9) / 16)) && !isBrick(trunc((this.x + 8) / 32), trunc((this.y - 7) / 16)) || isBrick(trunc((this.x - 8) / 32), trunc((this.y - 23) / 16)) || isBrick(trunc((this.x + 8) / 32), trunc((this.y - 23) / 16)) || isBrick(trunc((this.x - 8) / 32), trunc((this.y - 16) / 16)) || isBrick(trunc((this.x + 8) / 32), trunc((this.y - 16) / 16));\n    }\n  }, {\n    key: \"updateCacheBrickOnHead\",\n    value: function updateCacheBrickOnHead() {\n      this.cacheBrickOnHead = isBrick(trunc((this.x - 9) / 32), trunc((this.y - 25) / 16)) && !isBrick(trunc((this.x - 9) / 32), trunc((this.y - 23) / 16)) || isBrick(trunc((this.x + 9) / 32), trunc((this.y - 25) / 16)) && !isBrick(trunc((this.x + 9) / 32), trunc((this.y - 23) / 16)) || isBrick(trunc((this.x - 9) / 32), trunc((this.y - 24) / 16)) && !isBrick(trunc((this.x - 9) / 32), trunc((this.y - 8) / 16)) || isBrick(trunc((this.x + 9) / 32), trunc((this.y - 24) / 16)) && !isBrick(trunc((this.x + 9) / 32), trunc((this.y - 8) / 16));\n    }\n  }, {\n    key: \"isOnGround\",\n    value: function isOnGround() {\n      return this.cacheOnGround;\n    }\n  }, {\n    key: \"isBrickOnHead\",\n    value: function isBrickOnHead() {\n      return this.cacheBrickOnHead;\n    }\n  }, {\n    key: \"isBrickCrouchOnHead\",\n    value: function isBrickCrouchOnHead() {\n      return this.cacheBrickCrouchOnHead;\n    }\n  }]);\n}();\n\n\n//# sourceURL=webpack://nfk-web/./src/Player.js?\n}");

/***/ },

/***/ "./src/Render.js"
/*!***********************!*\
  !*** ./src/Render.js ***!
  \***********************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

eval("{__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   renderGame: () => (/* binding */ renderGame),\n/* harmony export */   renderMap: () => (/* binding */ renderMap)\n/* harmony export */ });\n/* harmony import */ var PIXI__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! PIXI */ \"PIXI\");\n/* harmony import */ var PIXI__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(PIXI__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var _Constants_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./Constants.js */ \"./src/Constants.js\");\n/* harmony import */ var _Map_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./Map.js */ \"./src/Map.js\");\n\n\n\nvar BRICK_HEIGHT = _Constants_js__WEBPACK_IMPORTED_MODULE_1__[\"default\"].BRICK_HEIGHT;\nvar BRICK_WIDTH = _Constants_js__WEBPACK_IMPORTED_MODULE_1__[\"default\"].BRICK_WIDTH;\nvar renderer = PIXI__WEBPACK_IMPORTED_MODULE_0___default().autoDetectRenderer(window.innerWidth, window.innerHeight);\nrenderer.view.style.display = \"block\";\nvar gameEl = document.getElementById('game');\ngameEl.appendChild(renderer.view);\nvar stage = new (PIXI__WEBPACK_IMPORTED_MODULE_0___default().Stage)(0x000000);\nvar mapGraphics = new (PIXI__WEBPACK_IMPORTED_MODULE_0___default().Graphics)();\nmapGraphics.beginFill(0x999999);\nmapGraphics.lineStyle(1, 0xAAAAAA);\nstage.addChild(mapGraphics);\nvar localPlayerGraphics = new (PIXI__WEBPACK_IMPORTED_MODULE_0___default().Graphics)();\nlocalPlayerGraphics.beginFill(0xAAAAFF);\n//localPlayerGraphics.lineStyle(1, 0xFFFFFF);\nlocalPlayerGraphics.drawRect(0, 0, 20, BRICK_HEIGHT * 3);\nlocalPlayerGraphics.endFill();\nstage.addChild(localPlayerGraphics);\nvar localPlayerCenter = new (PIXI__WEBPACK_IMPORTED_MODULE_0___default().Graphics)();\nlocalPlayerCenter.beginFill(0x0000AA);\nlocalPlayerCenter.drawRect(0, 0, 2, 2);\nlocalPlayerCenter.endFill();\nstage.addChild(localPlayerCenter);\nvar dot1 = new (PIXI__WEBPACK_IMPORTED_MODULE_0___default().Graphics)();\nstage.addChild(dot1);\nvar dot2 = new (PIXI__WEBPACK_IMPORTED_MODULE_0___default().Graphics)();\nstage.addChild(dot2);\nvar floatCamera = false;\nvar halfWidth = 0;\nvar halfHeight = 0;\nvar mapDx = 0;\nvar mapDy = 0;\nfunction recalcFloatCamera() {\n  renderer.view.width = window.innerWidth - 20;\n  renderer.view.height = window.innerHeight;\n  floatCamera = _Map_js__WEBPACK_IMPORTED_MODULE_2__[\"default\"].getRows() > window.innerHeight / 16 || _Map_js__WEBPACK_IMPORTED_MODULE_2__[\"default\"].getCols() > (window.innerWidth - 20) / 32;\n  if (floatCamera) {\n    halfWidth = Math.floor((window.innerWidth - 20) / 2);\n    halfHeight = Math.floor(window.innerHeight / 2);\n  } else {\n    mapGraphics.x = mapDx = Math.floor((window.innerWidth - 20 - _Map_js__WEBPACK_IMPORTED_MODULE_2__[\"default\"].getCols() * 32) / 2);\n    mapGraphics.y = mapDy = Math.floor((window.innerHeight - _Map_js__WEBPACK_IMPORTED_MODULE_2__[\"default\"].getRows() * 16) / 2);\n  }\n}\nwindow.addEventListener('resize', recalcFloatCamera, false);\nfunction renderMap() {\n  var tmpRows = _Map_js__WEBPACK_IMPORTED_MODULE_2__[\"default\"].getRows();\n  var tmpCols = _Map_js__WEBPACK_IMPORTED_MODULE_2__[\"default\"].getCols();\n  var tmpRow, tmpCol;\n  for (tmpRow = 0; tmpRow < tmpRows; tmpRow++) {\n    for (tmpCol = 0; tmpCol < tmpCols; tmpCol++) {\n      if (_Map_js__WEBPACK_IMPORTED_MODULE_2__[\"default\"].isBrick(tmpCol, tmpRow)) {\n        mapGraphics.drawRect(tmpCol * 32, tmpRow * 16, 31, 15);\n      }\n    }\n  }\n  renderer.render(stage);\n  recalcFloatCamera();\n}\nvar tmpX = 0;\nvar tmpY = 0;\nfunction renderGame(player) {\n  if (floatCamera) {\n    tmpX = halfWidth;\n    tmpY = halfHeight;\n    mapGraphics.x = halfWidth - player.x;\n    mapGraphics.y = halfHeight - player.y;\n  } else {\n    tmpX = player.x + mapDx;\n    tmpY = player.y + mapDy;\n  }\n  localPlayerGraphics.x = tmpX - 10; //player.x - 10;\n  if (player.crouch) {\n    localPlayerGraphics.y = tmpY - 8; //player.y - 8;\n    localPlayerGraphics.height = 2 / 3;\n  } else {\n    localPlayerGraphics.y = tmpY - 24; //player.y - 24;\n    localPlayerGraphics.height = 1;\n  }\n  localPlayerCenter.x = tmpX - 1; //player.x-1;\n  localPlayerCenter.y = tmpY - 1;\n  renderer.render(stage);\n}\n\n//# sourceURL=webpack://nfk-web/./src/Render.js?\n}");

/***/ },

/***/ "./src/Sound.js"
/*!**********************!*\
  !*** ./src/Sound.js ***!
  \**********************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

eval("{__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   \"default\": () => (__WEBPACK_DEFAULT_EXPORT__)\n/* harmony export */ });\n/* harmony import */ var Howl__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! Howl */ \"Howl\");\n/* harmony import */ var Howl__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(Howl__WEBPACK_IMPORTED_MODULE_0__);\n\nvar _jump = new (Howl__WEBPACK_IMPORTED_MODULE_0___default())({\n  urls: ['sounds/jump1.wav']\n});\n/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = ({\n  jump: function jump() {\n    _jump.play();\n  }\n});\n\n//# sourceURL=webpack://nfk-web/./src/Sound.js?\n}");

/***/ },

/***/ "./src/Utils.js"
/*!**********************!*\
  !*** ./src/Utils.js ***!
  \**********************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

eval("{__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   \"default\": () => (__WEBPACK_DEFAULT_EXPORT__)\n/* harmony export */ });\n/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = ({\n  trunc: Math.trunc || function (val) {\n    return val < 0 ? Math.ceil(val) : Math.floor(val);\n  }\n});\n\n//# sourceURL=webpack://nfk-web/./src/Utils.js?\n}");

/***/ },

/***/ "./src/app.js"
/*!********************!*\
  !*** ./src/app.js ***!
  \********************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

eval("{__webpack_require__.r(__webpack_exports__);\n/* harmony import */ var _Map_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./Map.js */ \"./src/Map.js\");\n/* harmony import */ var _Constants_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./Constants.js */ \"./src/Constants.js\");\n/* harmony import */ var _Keyboard_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./Keyboard.js */ \"./src/Keyboard.js\");\n/* harmony import */ var _Player_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./Player.js */ \"./src/Player.js\");\n/* harmony import */ var _Render_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./Render.js */ \"./src/Render.js\");\n/* harmony import */ var _Physics_js__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./Physics.js */ \"./src/Physics.js\");\n/* harmony import */ var Stats__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! Stats */ \"Stats\");\n/* harmony import */ var Stats__WEBPACK_IMPORTED_MODULE_6___default = /*#__PURE__*/__webpack_require__.n(Stats__WEBPACK_IMPORTED_MODULE_6__);\n\n\n\n\n\n\n\nvar stats = new (Stats__WEBPACK_IMPORTED_MODULE_6___default())();\ndocument.getElementById('fps').appendChild(stats.domElement);\n_Map_js__WEBPACK_IMPORTED_MODULE_0__[\"default\"].loadFromQuery();\n(0,_Render_js__WEBPACK_IMPORTED_MODULE_4__.renderMap)();\nvar localPlayer = new _Player_js__WEBPACK_IMPORTED_MODULE_3__[\"default\"]();\n\n//just for safe respawn\nvar respawn = _Map_js__WEBPACK_IMPORTED_MODULE_0__[\"default\"].getRandomRespawn();\nlocalPlayer.setXY(respawn.col * _Constants_js__WEBPACK_IMPORTED_MODULE_1__[\"default\"].BRICK_WIDTH + 10, respawn.row * _Constants_js__WEBPACK_IMPORTED_MODULE_1__[\"default\"].BRICK_HEIGHT - 24);\nfunction gameLoop(timestamp) {\n  stats.begin();\n  localPlayer.keyUp = _Keyboard_js__WEBPACK_IMPORTED_MODULE_2__[\"default\"].keyUp;\n  localPlayer.keyDown = _Keyboard_js__WEBPACK_IMPORTED_MODULE_2__[\"default\"].keyDown;\n  localPlayer.keyLeft = _Keyboard_js__WEBPACK_IMPORTED_MODULE_2__[\"default\"].keyLeft;\n  localPlayer.keyRight = _Keyboard_js__WEBPACK_IMPORTED_MODULE_2__[\"default\"].keyRight;\n  (0,_Physics_js__WEBPACK_IMPORTED_MODULE_5__.updateGame)(localPlayer, timestamp);\n  (0,_Render_js__WEBPACK_IMPORTED_MODULE_4__.renderGame)(localPlayer);\n  requestAnimationFrame(gameLoop); //infinite render loop\n\n  stats.end();\n}\nrequestAnimationFrame(gameLoop);\n\n//# sourceURL=webpack://nfk-web/./src/app.js?\n}");

/***/ },

/***/ "Howl"
/*!***********************!*\
  !*** external "Howl" ***!
  \***********************/
(module) {

module.exports = Howl;

/***/ },

/***/ "PIXI"
/*!***********************!*\
  !*** external "PIXI" ***!
  \***********************/
(module) {

module.exports = PIXI;

/***/ },

/***/ "Stats"
/*!************************!*\
  !*** external "Stats" ***!
  \************************/
(module) {

module.exports = Stats;

/***/ }

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Check if module exists (development only)
/******/ 		if (__webpack_modules__[moduleId] === undefined) {
/******/ 			var e = new Error("Cannot find module '" + moduleId + "'");
/******/ 			e.code = 'MODULE_NOT_FOUND';
/******/ 			throw e;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat get default export */
/******/ 	(() => {
/******/ 		// getDefaultExport function for compatibility with non-harmony modules
/******/ 		__webpack_require__.n = (module) => {
/******/ 			var getter = module && module.__esModule ?
/******/ 				() => (module['default']) :
/******/ 				() => (module);
/******/ 			__webpack_require__.d(getter, { a: getter });
/******/ 			return getter;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module can't be inlined because the eval devtool is used.
/******/ 	var __webpack_exports__ = __webpack_require__("./src/app.js");
/******/ 	
/******/ })()
;