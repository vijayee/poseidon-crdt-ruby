/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ "./src/document.js":
/*!*************************!*\
  !*** ./src/document.js ***!
  \*************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const Tree= __webpack_require__(/*! ./tree */ "./src/tree.js")
let _operations = new WeakMap()
let _deletions = new WeakMap()
let _locations = new WeakMap()
let _text = new WeakMap()
let _revision = new WeakMap()
let _context = new WeakMap()
let _priority = new WeakMap()
let _counter = new WeakMap()

function adjustOperation(operation1, operation2) {
  if (operation2.type != 'insert') {
    return operation1
  }
  return adjustInsertOperation(operation1, operation2.index, operation2.priority)
}

function adjustInsertOperation(operation, index, priority) {
  if (operation.type != 'insert') {
     if (operation.index < index) {
       return operation
     }
     return {type: operation.type, index: operation.index + 1, id: operation.id}
  }
  if ((operation.index < index) || ((operation.index == index) && (operation.priority < priority))) {
    return operation
  }
  return {...operation, index: operation.index + 1}
}

class Document {
  constructor() {
    _operations.set(this, [])
    _deletions.set(this, new Tree())
    _locations.set(this, [])
    _text.set(this,``)
    _revision.set(this, 0)
    _context.set(this, new Set())
    _priority.set(this, Math.floor(Math.random() * 0x1000000))
    _counter.set(this, 0)
  }
  get text () {
    return _text.get(this)
  }
  get locations () {
    return _locations.get(this)
  }
  set locations (value) {
    if (!Array.isArray(value)) {
      throw new Error("Locations much be an array of integers")
    }
    _locations.set(this, value)
  }
  get revision () {
    return _revision.get(this)
  }
  updates (rev) {
    let operations = _operations.get(this)
    return operations.slice(rev)
  }
  get operationsCount() {
    let operations = _operations.get(this)
    return operations.length
  }
  get operations () {
    let operations = _operations.get(this)
    return operations.slice(0)
  }
  getId() {
    let priority = _priority.get(this)
    let counter = _counter.get(this)
    counter++
    _counter.set(this, counter)
    return (priority * 0x100000) + counter;
  }
  add(operation) {
    let operations = _operations.get(this)
    operations.push(operation)
    let deletions, index, text
    switch (operation.type) {
      case 'delete':
        deletions = _deletions.get(this)
        if (!deletions.contains(operation.index)) {
          index = deletions.inverse(operation.index)
          deletions.union(operation.index)
          text = _text.get(this)
          text = text.slice(0, index) + text.slice(index + 1)
          _text.set(this, text)
          let locations = _locations.get(this)
          for (var i = 0; i < locations.length; i++) {
            if (locations[i] > index) {
              locations[i] -= 1
            }
          }
        }
        break
      case 'insert':
        deletions = _deletions.get(this)
        let locations = _locations.get(this)
        deletions.forwardTransform(operation.index)
        index = deletions.inverse(operation.index)
        text = _text.get(this)
        text = text.slice(0, index) + operation.value + text.slice(index)
        _text.set(this, text)
        for (var i = 0; i < locations.length; i++) {
          if (locations[i] > index) {
            locations[i] += 1
          }
        }
        break
    }
  }
  merge(operation) {
    let priority = _priority.get(this)
    let counter = _counter.get(this)
    let currentId = priority + counter
    // ignore our own ops
    if ((operation.priority == priority) && (operation.id < currentId)) {
      return
    }
    let id = operation.id
    let operations = _operations.get(this)
    let revision = _revision.get(this)
    let context = _context.get(this)

    if ((revision < operations.length) && (operations[revision].id == id)) {
      revision++
      while ((revision < operations.length) && (context.has(operations[revision].id))) {
        context.delete(operations[revision].id)
        revision++
      }
      _revision.set(this, revision)
      return
    }

    for (let index = revision; index < operations.length; index++) {
      if (operations[index].id == id) {
        context.add(id)
        return
      }
    }

    let insertList = []
    let S , T
    for (let index = operations.length - 1; index >= revision; index--) {
      let current = operations[index]
      if (current.type == 'insert') {
        let i = S ? S.transform(current.index) : current.index
        if (!context.has(current.index)) {
          insertList.push([(T ? T.inverse(i): i), current.priority])
          if (T) {
            T.union(i)
          } else {
            T = new Tree(i)
          }
        }
        if (S) {
          S.union(i)
        } else {
          S = new Tree(i)
        }
      }
    }

    for (let i = insertList.length - 1; i >= 0; i--) {
      operation = adjustInsertOperation(operation, insertList[i][0], insertList[i][1])
    }

    let isCurrent = (revision == operations.length)
    this.add(operation)
    if (isCurrent) {
      revision++
    } else {
      context.add(id)
    }
    _revision.set(this, revision)
  }
  transformIndex(index) {
    let deletions = _deletions.get(this)
    return deletions.transform(index)
  }
  static getDiff(oldText, newText, cursor) {
    let delta = newText.length - oldText.length
    let limit = Math.max(0, cursor - delta)
    let end = oldText.length
    while ((end > limit) && (oldText.charAt(end -1)  == newText.charAt((end + delta) - 1))) {
      end -= 1
    }
    let start = 0
    let startLimit = cursor - Math.max(0, delta)
    while ((start < startLimit) && (oldText.charAt(start) == newText.charAt(start))) {
      start += 1
    }
    return {start, end, newText: newText.slice(start, end + delta)}
  }
  diffToOps(diff) {
    let {start , end, newText} = diff
    let result = []
    let priority = _priority.get(this)
    for (let i = start; i < end; i++) {
      result.push({priority, type: 'delete', index: this.transformIndex(i), id: this.getId()})
    }
    var index = this.transformIndex(end)
    for (var i = 0; i < newText.length; i++) {
      result.push({priority, type: 'insert', index: (index + i), id: this.getId(), value: newText.charAt(i)})
    }
    return result
  }
}
module.exports = Document

/***/ }),

/***/ "./src/tree.js":
/*!*********************!*\
  !*** ./src/tree.js ***!
  \*********************/
/***/ ((module) => {

class Node {
  constructor (value, left, right) {
    let leftHeight = left ? left.height : 0
    let rightHeight = right ? right.height : 0
    if (leftHeight > rightHeight + 1) {
      this.value = left.value
      this.left = left.left
      this.right = new Node(value - left.value, left.right, right)
    } else if (rightHeight > leftHeight + 1) {
      this.left = new Node(value, left, right.left)
      this.value = value + right.value
      this.right = right.right
    } else {
      this.left = left
      this.right = right
      this.value = value
    }
    this.size = (this.left ? this.left.size : 0) + (this.right ? this.right.size : 0) + 1
    this.height = Math.max((this.left ? this.left.height : 0), (this.right ? this.right.height : 0)) + 1
  }
}
let _root = new WeakMap()
class Tree {
  constructor (value) {
    if (value) {
      _root.set(this, new Node(value))
    }
  }

  get height () {
    let root = _root.get(this)
    return root ? root.height : 0
  }

  get size () {
    let root = _root.get(this)
    return root ? root.height : 0
  }

  forwardTransform (i, node) {
    if (!node) {
      let root = _root.get(this)
      if (root) {
        root = this.forwardTransform(i, root)
        _root.set(this, root)
        return root
      } else {
         return null
      }
    }
    if (i <= node.vaue) {
      let transformLeft = node.left ? this.forwardTransform(i, node.left) : node.left
      return new Node(node.value + 1, transformLeft, node.right)
    } else {
      let transformRight =  node.right ? this.forwardTransform(i - node.value, node.right) : node.right
      return new Node(node.value, node.left, transformRight)
    }
  }

  inverse (i) {
    let node = _root.get(this)
    let result = i
    while (node != null) {
      if (i < node.value) {
        node = node.left
      } else {
        i -= node.value
        result -= (node.left ? node.left.size : 0) + 1
        node = node.right
      }
    }
    return result
  }

  transform (i) {
    let node = _root.get(this)
    let base = 0
    while (node != null) {
      let left = node.left
      let x = node.value - (left ? left.size : 0)
      if (i < x) {
        node = left
      } else {
        i =  1 + i - x
        base += node.value
        node = node.right
      }
    }
    return base + i
  }

  union (i, node) {
    if (!node) {
      let root = _root.get(this)
      if (root) {
        root = this.union(i, root)
        _root.set(this, root)
        return root
      } else {
        root = new Node(i)
        _root.set(this, root)
        return root
      }
    }
    if (i < node.value) {
      let unionLeft = node.left ? this.union(i, node.left) : new Node(i)
      return new Node(node.value, unionLeft, node.right)
    } else if (i > node.value) {
      let unionRight = node.right ? this.union(i - node.value, node.right) : new Node(i - node.value)
      return new Node(node.value, node.left, unionRight)
    } else {
      return node
    }
  }

  contains(i) {
    let node = _root.get(this)
    while (node != null) {
      if (i < node.value) {
        node = node.left
      } else if (i > node.value) {
        i -= node.value
        node = node.right
      } else {
        return true
      }
    }
    return false
  }

  toArray(node, base, result) {
    node = node ?? _root.get(this)
    base = base ?? 0
    result = result ?? []
    if (node) {
      node.left && this.toArray(node.left, base, result)
      base += node.value
      result.push(base)
      node.right && this.toArray(node.right, base, result)
    }
    return result
  }
}

module.exports = Tree

/***/ })

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
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
/*!***********************!*\
  !*** ./src/client.js ***!
  \***********************/

const Document = __webpack_require__(/*! ./document */ "./src/document.js")
var textElement = document.getElementById("text")

textElement.selectionStart = 0
textElement.selectionEnd = 0
var oldText = ""
let doc = new Document()

function connect () {
  window.socket = new WebSocket(`ws://${location.host}`)
  socket.onclose = disconnected
  socket.onopen = connected
  socket.onmessage = receive
  socket.onerror = errorMsg
}
function connected () {
  console.log('Connection Established')
}
function disconnected () {
  console.log('Connection Lost')
  setTimeout(connect, 10000)
}
connect()
function errorMsg(err) {
  console.error(err)
}
textElement.addEventListener("input", function(event) {
  let diff = Document.getDiff(oldText, textElement.value, textElement.selectionEnd)
  let ops = doc.diffToOps(diff)
  // apply ops locally
  for (var i = 0; i < ops.length; i++) {
    doc.add(ops[i])
  }
  socket.send(JSON.stringify({type: 'update', value: ops}))
  console.log('ops:' + JSON.stringify(ops))
  console.log('docstate: ' + doc.text)
  oldText = textElement.value
})
function receive (message) {
  let data = JSON.parse(message.data)
  switch (data.type) {
    case 'update':
      update(data.value)
      break
  }
}
function update (ops) {
  console.log('from server:' + JSON.stringify(ops))
  let rev = doc.operationsCount
  doc.locations = [textElement.selectionStart, textElement.selectionEnd]

  for (var i = 0; i < ops.length; i++) {
    doc.merge(ops[i])
  }
  textElement.value = doc.text
  oldText = textElement.value
  textElement.selectionStart = doc.locations[0]
  textElement.selectionEnd = doc.locations[1]
}
})();

/******/ })()
;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7QUFBQSxZQUFZLG1CQUFPLENBQUMsNkJBQVE7QUFDNUI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLGFBQWE7QUFDYjtBQUNBO0FBQ0E7QUFDQTtBQUNBLFVBQVU7QUFDVjs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsMEJBQTBCLHNCQUFzQjtBQUNoRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0Esd0JBQXdCLHNCQUFzQjtBQUM5QztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUEsK0JBQStCLDJCQUEyQjtBQUMxRDtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQSw0Q0FBNEMsbUJBQW1CO0FBQy9EO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsWUFBWTtBQUNaO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxVQUFVO0FBQ1Y7QUFDQTtBQUNBO0FBQ0E7O0FBRUEsd0NBQXdDLFFBQVE7QUFDaEQ7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU07QUFDTjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsWUFBWTtBQUNaO0FBQ0E7QUFDQSxTQUFTLHNCQUFzQjtBQUMvQjtBQUNBO0FBQ0Esd0JBQXdCLFNBQVM7QUFDakMsbUJBQW1CLDBFQUEwRTtBQUM3RjtBQUNBO0FBQ0Esb0JBQW9CLG9CQUFvQjtBQUN4QyxtQkFBbUIseUZBQXlGO0FBQzVHO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7Ozs7QUNqTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU07QUFDTjtBQUNBO0FBQ0E7QUFDQSxNQUFNO0FBQ047QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsUUFBUTtBQUNSO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU07QUFDTjtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxRQUFRO0FBQ1I7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFFBQVE7QUFDUjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFFBQVE7QUFDUjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsTUFBTTtBQUNOO0FBQ0E7QUFDQSxNQUFNO0FBQ047QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxRQUFRO0FBQ1I7QUFDQTtBQUNBLFFBQVE7QUFDUjtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBOzs7Ozs7VUNoSkE7VUFDQTs7VUFFQTtVQUNBO1VBQ0E7VUFDQTtVQUNBO1VBQ0E7VUFDQTtVQUNBO1VBQ0E7VUFDQTtVQUNBO1VBQ0E7VUFDQTs7VUFFQTtVQUNBOztVQUVBO1VBQ0E7VUFDQTs7Ozs7Ozs7OztBQ3JCQSxpQkFBaUIsbUJBQU8sQ0FBQyxxQ0FBWTtBQUNyQzs7QUFFQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBLHdDQUF3QyxjQUFjO0FBQ3REO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxrQkFBa0IsZ0JBQWdCO0FBQ2xDO0FBQ0E7QUFDQSw4QkFBOEIsMkJBQTJCO0FBQ3pEO0FBQ0E7QUFDQTtBQUNBLENBQUM7QUFDRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUEsa0JBQWtCLGdCQUFnQjtBQUNsQztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxDIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vcG9zZWlkb24tY3JkdC8uL3NyYy9kb2N1bWVudC5qcyIsIndlYnBhY2s6Ly9wb3NlaWRvbi1jcmR0Ly4vc3JjL3RyZWUuanMiLCJ3ZWJwYWNrOi8vcG9zZWlkb24tY3JkdC93ZWJwYWNrL2Jvb3RzdHJhcCIsIndlYnBhY2s6Ly9wb3NlaWRvbi1jcmR0Ly4vc3JjL2NsaWVudC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJjb25zdCBUcmVlPSByZXF1aXJlKCcuL3RyZWUnKVxubGV0IF9vcGVyYXRpb25zID0gbmV3IFdlYWtNYXAoKVxubGV0IF9kZWxldGlvbnMgPSBuZXcgV2Vha01hcCgpXG5sZXQgX2xvY2F0aW9ucyA9IG5ldyBXZWFrTWFwKClcbmxldCBfdGV4dCA9IG5ldyBXZWFrTWFwKClcbmxldCBfcmV2aXNpb24gPSBuZXcgV2Vha01hcCgpXG5sZXQgX2NvbnRleHQgPSBuZXcgV2Vha01hcCgpXG5sZXQgX3ByaW9yaXR5ID0gbmV3IFdlYWtNYXAoKVxubGV0IF9jb3VudGVyID0gbmV3IFdlYWtNYXAoKVxuXG5mdW5jdGlvbiBhZGp1c3RPcGVyYXRpb24ob3BlcmF0aW9uMSwgb3BlcmF0aW9uMikge1xuICBpZiAob3BlcmF0aW9uMi50eXBlICE9ICdpbnNlcnQnKSB7XG4gICAgcmV0dXJuIG9wZXJhdGlvbjFcbiAgfVxuICByZXR1cm4gYWRqdXN0SW5zZXJ0T3BlcmF0aW9uKG9wZXJhdGlvbjEsIG9wZXJhdGlvbjIuaW5kZXgsIG9wZXJhdGlvbjIucHJpb3JpdHkpXG59XG5cbmZ1bmN0aW9uIGFkanVzdEluc2VydE9wZXJhdGlvbihvcGVyYXRpb24sIGluZGV4LCBwcmlvcml0eSkge1xuICBpZiAob3BlcmF0aW9uLnR5cGUgIT0gJ2luc2VydCcpIHtcbiAgICAgaWYgKG9wZXJhdGlvbi5pbmRleCA8IGluZGV4KSB7XG4gICAgICAgcmV0dXJuIG9wZXJhdGlvblxuICAgICB9XG4gICAgIHJldHVybiB7dHlwZTogb3BlcmF0aW9uLnR5cGUsIGluZGV4OiBvcGVyYXRpb24uaW5kZXggKyAxLCBpZDogb3BlcmF0aW9uLmlkfVxuICB9XG4gIGlmICgob3BlcmF0aW9uLmluZGV4IDwgaW5kZXgpIHx8ICgob3BlcmF0aW9uLmluZGV4ID09IGluZGV4KSAmJiAob3BlcmF0aW9uLnByaW9yaXR5IDwgcHJpb3JpdHkpKSkge1xuICAgIHJldHVybiBvcGVyYXRpb25cbiAgfVxuICByZXR1cm4gey4uLm9wZXJhdGlvbiwgaW5kZXg6IG9wZXJhdGlvbi5pbmRleCArIDF9XG59XG5cbmNsYXNzIERvY3VtZW50IHtcbiAgY29uc3RydWN0b3IoKSB7XG4gICAgX29wZXJhdGlvbnMuc2V0KHRoaXMsIFtdKVxuICAgIF9kZWxldGlvbnMuc2V0KHRoaXMsIG5ldyBUcmVlKCkpXG4gICAgX2xvY2F0aW9ucy5zZXQodGhpcywgW10pXG4gICAgX3RleHQuc2V0KHRoaXMsYGApXG4gICAgX3JldmlzaW9uLnNldCh0aGlzLCAwKVxuICAgIF9jb250ZXh0LnNldCh0aGlzLCBuZXcgU2V0KCkpXG4gICAgX3ByaW9yaXR5LnNldCh0aGlzLCBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAweDEwMDAwMDApKVxuICAgIF9jb3VudGVyLnNldCh0aGlzLCAwKVxuICB9XG4gIGdldCB0ZXh0ICgpIHtcbiAgICByZXR1cm4gX3RleHQuZ2V0KHRoaXMpXG4gIH1cbiAgZ2V0IGxvY2F0aW9ucyAoKSB7XG4gICAgcmV0dXJuIF9sb2NhdGlvbnMuZ2V0KHRoaXMpXG4gIH1cbiAgc2V0IGxvY2F0aW9ucyAodmFsdWUpIHtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJMb2NhdGlvbnMgbXVjaCBiZSBhbiBhcnJheSBvZiBpbnRlZ2Vyc1wiKVxuICAgIH1cbiAgICBfbG9jYXRpb25zLnNldCh0aGlzLCB2YWx1ZSlcbiAgfVxuICBnZXQgcmV2aXNpb24gKCkge1xuICAgIHJldHVybiBfcmV2aXNpb24uZ2V0KHRoaXMpXG4gIH1cbiAgdXBkYXRlcyAocmV2KSB7XG4gICAgbGV0IG9wZXJhdGlvbnMgPSBfb3BlcmF0aW9ucy5nZXQodGhpcylcbiAgICByZXR1cm4gb3BlcmF0aW9ucy5zbGljZShyZXYpXG4gIH1cbiAgZ2V0IG9wZXJhdGlvbnNDb3VudCgpIHtcbiAgICBsZXQgb3BlcmF0aW9ucyA9IF9vcGVyYXRpb25zLmdldCh0aGlzKVxuICAgIHJldHVybiBvcGVyYXRpb25zLmxlbmd0aFxuICB9XG4gIGdldCBvcGVyYXRpb25zICgpIHtcbiAgICBsZXQgb3BlcmF0aW9ucyA9IF9vcGVyYXRpb25zLmdldCh0aGlzKVxuICAgIHJldHVybiBvcGVyYXRpb25zLnNsaWNlKDApXG4gIH1cbiAgZ2V0SWQoKSB7XG4gICAgbGV0IHByaW9yaXR5ID0gX3ByaW9yaXR5LmdldCh0aGlzKVxuICAgIGxldCBjb3VudGVyID0gX2NvdW50ZXIuZ2V0KHRoaXMpXG4gICAgY291bnRlcisrXG4gICAgX2NvdW50ZXIuc2V0KHRoaXMsIGNvdW50ZXIpXG4gICAgcmV0dXJuIChwcmlvcml0eSAqIDB4MTAwMDAwKSArIGNvdW50ZXI7XG4gIH1cbiAgYWRkKG9wZXJhdGlvbikge1xuICAgIGxldCBvcGVyYXRpb25zID0gX29wZXJhdGlvbnMuZ2V0KHRoaXMpXG4gICAgb3BlcmF0aW9ucy5wdXNoKG9wZXJhdGlvbilcbiAgICBsZXQgZGVsZXRpb25zLCBpbmRleCwgdGV4dFxuICAgIHN3aXRjaCAob3BlcmF0aW9uLnR5cGUpIHtcbiAgICAgIGNhc2UgJ2RlbGV0ZSc6XG4gICAgICAgIGRlbGV0aW9ucyA9IF9kZWxldGlvbnMuZ2V0KHRoaXMpXG4gICAgICAgIGlmICghZGVsZXRpb25zLmNvbnRhaW5zKG9wZXJhdGlvbi5pbmRleCkpIHtcbiAgICAgICAgICBpbmRleCA9IGRlbGV0aW9ucy5pbnZlcnNlKG9wZXJhdGlvbi5pbmRleClcbiAgICAgICAgICBkZWxldGlvbnMudW5pb24ob3BlcmF0aW9uLmluZGV4KVxuICAgICAgICAgIHRleHQgPSBfdGV4dC5nZXQodGhpcylcbiAgICAgICAgICB0ZXh0ID0gdGV4dC5zbGljZSgwLCBpbmRleCkgKyB0ZXh0LnNsaWNlKGluZGV4ICsgMSlcbiAgICAgICAgICBfdGV4dC5zZXQodGhpcywgdGV4dClcbiAgICAgICAgICBsZXQgbG9jYXRpb25zID0gX2xvY2F0aW9ucy5nZXQodGhpcylcbiAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxvY2F0aW9ucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKGxvY2F0aW9uc1tpXSA+IGluZGV4KSB7XG4gICAgICAgICAgICAgIGxvY2F0aW9uc1tpXSAtPSAxXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlICdpbnNlcnQnOlxuICAgICAgICBkZWxldGlvbnMgPSBfZGVsZXRpb25zLmdldCh0aGlzKVxuICAgICAgICBsZXQgbG9jYXRpb25zID0gX2xvY2F0aW9ucy5nZXQodGhpcylcbiAgICAgICAgZGVsZXRpb25zLmZvcndhcmRUcmFuc2Zvcm0ob3BlcmF0aW9uLmluZGV4KVxuICAgICAgICBpbmRleCA9IGRlbGV0aW9ucy5pbnZlcnNlKG9wZXJhdGlvbi5pbmRleClcbiAgICAgICAgdGV4dCA9IF90ZXh0LmdldCh0aGlzKVxuICAgICAgICB0ZXh0ID0gdGV4dC5zbGljZSgwLCBpbmRleCkgKyBvcGVyYXRpb24udmFsdWUgKyB0ZXh0LnNsaWNlKGluZGV4KVxuICAgICAgICBfdGV4dC5zZXQodGhpcywgdGV4dClcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsb2NhdGlvbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICBpZiAobG9jYXRpb25zW2ldID4gaW5kZXgpIHtcbiAgICAgICAgICAgIGxvY2F0aW9uc1tpXSArPSAxXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGJyZWFrXG4gICAgfVxuICB9XG4gIG1lcmdlKG9wZXJhdGlvbikge1xuICAgIGxldCBwcmlvcml0eSA9IF9wcmlvcml0eS5nZXQodGhpcylcbiAgICBsZXQgY291bnRlciA9IF9jb3VudGVyLmdldCh0aGlzKVxuICAgIGxldCBjdXJyZW50SWQgPSBwcmlvcml0eSArIGNvdW50ZXJcbiAgICAvLyBpZ25vcmUgb3VyIG93biBvcHNcbiAgICBpZiAoKG9wZXJhdGlvbi5wcmlvcml0eSA9PSBwcmlvcml0eSkgJiYgKG9wZXJhdGlvbi5pZCA8IGN1cnJlbnRJZCkpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBsZXQgaWQgPSBvcGVyYXRpb24uaWRcbiAgICBsZXQgb3BlcmF0aW9ucyA9IF9vcGVyYXRpb25zLmdldCh0aGlzKVxuICAgIGxldCByZXZpc2lvbiA9IF9yZXZpc2lvbi5nZXQodGhpcylcbiAgICBsZXQgY29udGV4dCA9IF9jb250ZXh0LmdldCh0aGlzKVxuXG4gICAgaWYgKChyZXZpc2lvbiA8IG9wZXJhdGlvbnMubGVuZ3RoKSAmJiAob3BlcmF0aW9uc1tyZXZpc2lvbl0uaWQgPT0gaWQpKSB7XG4gICAgICByZXZpc2lvbisrXG4gICAgICB3aGlsZSAoKHJldmlzaW9uIDwgb3BlcmF0aW9ucy5sZW5ndGgpICYmIChjb250ZXh0LmhhcyhvcGVyYXRpb25zW3JldmlzaW9uXS5pZCkpKSB7XG4gICAgICAgIGNvbnRleHQuZGVsZXRlKG9wZXJhdGlvbnNbcmV2aXNpb25dLmlkKVxuICAgICAgICByZXZpc2lvbisrXG4gICAgICB9XG4gICAgICBfcmV2aXNpb24uc2V0KHRoaXMsIHJldmlzaW9uKVxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgZm9yIChsZXQgaW5kZXggPSByZXZpc2lvbjsgaW5kZXggPCBvcGVyYXRpb25zLmxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgaWYgKG9wZXJhdGlvbnNbaW5kZXhdLmlkID09IGlkKSB7XG4gICAgICAgIGNvbnRleHQuYWRkKGlkKVxuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICB9XG5cbiAgICBsZXQgaW5zZXJ0TGlzdCA9IFtdXG4gICAgbGV0IFMgLCBUXG4gICAgZm9yIChsZXQgaW5kZXggPSBvcGVyYXRpb25zLmxlbmd0aCAtIDE7IGluZGV4ID49IHJldmlzaW9uOyBpbmRleC0tKSB7XG4gICAgICBsZXQgY3VycmVudCA9IG9wZXJhdGlvbnNbaW5kZXhdXG4gICAgICBpZiAoY3VycmVudC50eXBlID09ICdpbnNlcnQnKSB7XG4gICAgICAgIGxldCBpID0gUyA/IFMudHJhbnNmb3JtKGN1cnJlbnQuaW5kZXgpIDogY3VycmVudC5pbmRleFxuICAgICAgICBpZiAoIWNvbnRleHQuaGFzKGN1cnJlbnQuaW5kZXgpKSB7XG4gICAgICAgICAgaW5zZXJ0TGlzdC5wdXNoKFsoVCA/IFQuaW52ZXJzZShpKTogaSksIGN1cnJlbnQucHJpb3JpdHldKVxuICAgICAgICAgIGlmIChUKSB7XG4gICAgICAgICAgICBULnVuaW9uKGkpXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIFQgPSBuZXcgVHJlZShpKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoUykge1xuICAgICAgICAgIFMudW5pb24oaSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBTID0gbmV3IFRyZWUoaSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAobGV0IGkgPSBpbnNlcnRMaXN0Lmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICBvcGVyYXRpb24gPSBhZGp1c3RJbnNlcnRPcGVyYXRpb24ob3BlcmF0aW9uLCBpbnNlcnRMaXN0W2ldWzBdLCBpbnNlcnRMaXN0W2ldWzFdKVxuICAgIH1cblxuICAgIGxldCBpc0N1cnJlbnQgPSAocmV2aXNpb24gPT0gb3BlcmF0aW9ucy5sZW5ndGgpXG4gICAgdGhpcy5hZGQob3BlcmF0aW9uKVxuICAgIGlmIChpc0N1cnJlbnQpIHtcbiAgICAgIHJldmlzaW9uKytcbiAgICB9IGVsc2Uge1xuICAgICAgY29udGV4dC5hZGQoaWQpXG4gICAgfVxuICAgIF9yZXZpc2lvbi5zZXQodGhpcywgcmV2aXNpb24pXG4gIH1cbiAgdHJhbnNmb3JtSW5kZXgoaW5kZXgpIHtcbiAgICBsZXQgZGVsZXRpb25zID0gX2RlbGV0aW9ucy5nZXQodGhpcylcbiAgICByZXR1cm4gZGVsZXRpb25zLnRyYW5zZm9ybShpbmRleClcbiAgfVxuICBzdGF0aWMgZ2V0RGlmZihvbGRUZXh0LCBuZXdUZXh0LCBjdXJzb3IpIHtcbiAgICBsZXQgZGVsdGEgPSBuZXdUZXh0Lmxlbmd0aCAtIG9sZFRleHQubGVuZ3RoXG4gICAgbGV0IGxpbWl0ID0gTWF0aC5tYXgoMCwgY3Vyc29yIC0gZGVsdGEpXG4gICAgbGV0IGVuZCA9IG9sZFRleHQubGVuZ3RoXG4gICAgd2hpbGUgKChlbmQgPiBsaW1pdCkgJiYgKG9sZFRleHQuY2hhckF0KGVuZCAtMSkgID09IG5ld1RleHQuY2hhckF0KChlbmQgKyBkZWx0YSkgLSAxKSkpIHtcbiAgICAgIGVuZCAtPSAxXG4gICAgfVxuICAgIGxldCBzdGFydCA9IDBcbiAgICBsZXQgc3RhcnRMaW1pdCA9IGN1cnNvciAtIE1hdGgubWF4KDAsIGRlbHRhKVxuICAgIHdoaWxlICgoc3RhcnQgPCBzdGFydExpbWl0KSAmJiAob2xkVGV4dC5jaGFyQXQoc3RhcnQpID09IG5ld1RleHQuY2hhckF0KHN0YXJ0KSkpIHtcbiAgICAgIHN0YXJ0ICs9IDFcbiAgICB9XG4gICAgcmV0dXJuIHtzdGFydCwgZW5kLCBuZXdUZXh0OiBuZXdUZXh0LnNsaWNlKHN0YXJ0LCBlbmQgKyBkZWx0YSl9XG4gIH1cbiAgZGlmZlRvT3BzKGRpZmYpIHtcbiAgICBsZXQge3N0YXJ0ICwgZW5kLCBuZXdUZXh0fSA9IGRpZmZcbiAgICBsZXQgcmVzdWx0ID0gW11cbiAgICBsZXQgcHJpb3JpdHkgPSBfcHJpb3JpdHkuZ2V0KHRoaXMpXG4gICAgZm9yIChsZXQgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICAgIHJlc3VsdC5wdXNoKHtwcmlvcml0eSwgdHlwZTogJ2RlbGV0ZScsIGluZGV4OiB0aGlzLnRyYW5zZm9ybUluZGV4KGkpLCBpZDogdGhpcy5nZXRJZCgpfSlcbiAgICB9XG4gICAgdmFyIGluZGV4ID0gdGhpcy50cmFuc2Zvcm1JbmRleChlbmQpXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuZXdUZXh0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICByZXN1bHQucHVzaCh7cHJpb3JpdHksIHR5cGU6ICdpbnNlcnQnLCBpbmRleDogKGluZGV4ICsgaSksIGlkOiB0aGlzLmdldElkKCksIHZhbHVlOiBuZXdUZXh0LmNoYXJBdChpKX0pXG4gICAgfVxuICAgIHJldHVybiByZXN1bHRcbiAgfVxufVxubW9kdWxlLmV4cG9ydHMgPSBEb2N1bWVudCIsImNsYXNzIE5vZGUge1xuICBjb25zdHJ1Y3RvciAodmFsdWUsIGxlZnQsIHJpZ2h0KSB7XG4gICAgbGV0IGxlZnRIZWlnaHQgPSBsZWZ0ID8gbGVmdC5oZWlnaHQgOiAwXG4gICAgbGV0IHJpZ2h0SGVpZ2h0ID0gcmlnaHQgPyByaWdodC5oZWlnaHQgOiAwXG4gICAgaWYgKGxlZnRIZWlnaHQgPiByaWdodEhlaWdodCArIDEpIHtcbiAgICAgIHRoaXMudmFsdWUgPSBsZWZ0LnZhbHVlXG4gICAgICB0aGlzLmxlZnQgPSBsZWZ0LmxlZnRcbiAgICAgIHRoaXMucmlnaHQgPSBuZXcgTm9kZSh2YWx1ZSAtIGxlZnQudmFsdWUsIGxlZnQucmlnaHQsIHJpZ2h0KVxuICAgIH0gZWxzZSBpZiAocmlnaHRIZWlnaHQgPiBsZWZ0SGVpZ2h0ICsgMSkge1xuICAgICAgdGhpcy5sZWZ0ID0gbmV3IE5vZGUodmFsdWUsIGxlZnQsIHJpZ2h0LmxlZnQpXG4gICAgICB0aGlzLnZhbHVlID0gdmFsdWUgKyByaWdodC52YWx1ZVxuICAgICAgdGhpcy5yaWdodCA9IHJpZ2h0LnJpZ2h0XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMubGVmdCA9IGxlZnRcbiAgICAgIHRoaXMucmlnaHQgPSByaWdodFxuICAgICAgdGhpcy52YWx1ZSA9IHZhbHVlXG4gICAgfVxuICAgIHRoaXMuc2l6ZSA9ICh0aGlzLmxlZnQgPyB0aGlzLmxlZnQuc2l6ZSA6IDApICsgKHRoaXMucmlnaHQgPyB0aGlzLnJpZ2h0LnNpemUgOiAwKSArIDFcbiAgICB0aGlzLmhlaWdodCA9IE1hdGgubWF4KCh0aGlzLmxlZnQgPyB0aGlzLmxlZnQuaGVpZ2h0IDogMCksICh0aGlzLnJpZ2h0ID8gdGhpcy5yaWdodC5oZWlnaHQgOiAwKSkgKyAxXG4gIH1cbn1cbmxldCBfcm9vdCA9IG5ldyBXZWFrTWFwKClcbmNsYXNzIFRyZWUge1xuICBjb25zdHJ1Y3RvciAodmFsdWUpIHtcbiAgICBpZiAodmFsdWUpIHtcbiAgICAgIF9yb290LnNldCh0aGlzLCBuZXcgTm9kZSh2YWx1ZSkpXG4gICAgfVxuICB9XG5cbiAgZ2V0IGhlaWdodCAoKSB7XG4gICAgbGV0IHJvb3QgPSBfcm9vdC5nZXQodGhpcylcbiAgICByZXR1cm4gcm9vdCA/IHJvb3QuaGVpZ2h0IDogMFxuICB9XG5cbiAgZ2V0IHNpemUgKCkge1xuICAgIGxldCByb290ID0gX3Jvb3QuZ2V0KHRoaXMpXG4gICAgcmV0dXJuIHJvb3QgPyByb290LmhlaWdodCA6IDBcbiAgfVxuXG4gIGZvcndhcmRUcmFuc2Zvcm0gKGksIG5vZGUpIHtcbiAgICBpZiAoIW5vZGUpIHtcbiAgICAgIGxldCByb290ID0gX3Jvb3QuZ2V0KHRoaXMpXG4gICAgICBpZiAocm9vdCkge1xuICAgICAgICByb290ID0gdGhpcy5mb3J3YXJkVHJhbnNmb3JtKGksIHJvb3QpXG4gICAgICAgIF9yb290LnNldCh0aGlzLCByb290KVxuICAgICAgICByZXR1cm4gcm9vdFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgIHJldHVybiBudWxsXG4gICAgICB9XG4gICAgfVxuICAgIGlmIChpIDw9IG5vZGUudmF1ZSkge1xuICAgICAgbGV0IHRyYW5zZm9ybUxlZnQgPSBub2RlLmxlZnQgPyB0aGlzLmZvcndhcmRUcmFuc2Zvcm0oaSwgbm9kZS5sZWZ0KSA6IG5vZGUubGVmdFxuICAgICAgcmV0dXJuIG5ldyBOb2RlKG5vZGUudmFsdWUgKyAxLCB0cmFuc2Zvcm1MZWZ0LCBub2RlLnJpZ2h0KVxuICAgIH0gZWxzZSB7XG4gICAgICBsZXQgdHJhbnNmb3JtUmlnaHQgPSAgbm9kZS5yaWdodCA/IHRoaXMuZm9yd2FyZFRyYW5zZm9ybShpIC0gbm9kZS52YWx1ZSwgbm9kZS5yaWdodCkgOiBub2RlLnJpZ2h0XG4gICAgICByZXR1cm4gbmV3IE5vZGUobm9kZS52YWx1ZSwgbm9kZS5sZWZ0LCB0cmFuc2Zvcm1SaWdodClcbiAgICB9XG4gIH1cblxuICBpbnZlcnNlIChpKSB7XG4gICAgbGV0IG5vZGUgPSBfcm9vdC5nZXQodGhpcylcbiAgICBsZXQgcmVzdWx0ID0gaVxuICAgIHdoaWxlIChub2RlICE9IG51bGwpIHtcbiAgICAgIGlmIChpIDwgbm9kZS52YWx1ZSkge1xuICAgICAgICBub2RlID0gbm9kZS5sZWZ0XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpIC09IG5vZGUudmFsdWVcbiAgICAgICAgcmVzdWx0IC09IChub2RlLmxlZnQgPyBub2RlLmxlZnQuc2l6ZSA6IDApICsgMVxuICAgICAgICBub2RlID0gbm9kZS5yaWdodFxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICB0cmFuc2Zvcm0gKGkpIHtcbiAgICBsZXQgbm9kZSA9IF9yb290LmdldCh0aGlzKVxuICAgIGxldCBiYXNlID0gMFxuICAgIHdoaWxlIChub2RlICE9IG51bGwpIHtcbiAgICAgIGxldCBsZWZ0ID0gbm9kZS5sZWZ0XG4gICAgICBsZXQgeCA9IG5vZGUudmFsdWUgLSAobGVmdCA/IGxlZnQuc2l6ZSA6IDApXG4gICAgICBpZiAoaSA8IHgpIHtcbiAgICAgICAgbm9kZSA9IGxlZnRcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGkgPSAgMSArIGkgLSB4XG4gICAgICAgIGJhc2UgKz0gbm9kZS52YWx1ZVxuICAgICAgICBub2RlID0gbm9kZS5yaWdodFxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gYmFzZSArIGlcbiAgfVxuXG4gIHVuaW9uIChpLCBub2RlKSB7XG4gICAgaWYgKCFub2RlKSB7XG4gICAgICBsZXQgcm9vdCA9IF9yb290LmdldCh0aGlzKVxuICAgICAgaWYgKHJvb3QpIHtcbiAgICAgICAgcm9vdCA9IHRoaXMudW5pb24oaSwgcm9vdClcbiAgICAgICAgX3Jvb3Quc2V0KHRoaXMsIHJvb3QpXG4gICAgICAgIHJldHVybiByb290XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByb290ID0gbmV3IE5vZGUoaSlcbiAgICAgICAgX3Jvb3Quc2V0KHRoaXMsIHJvb3QpXG4gICAgICAgIHJldHVybiByb290XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChpIDwgbm9kZS52YWx1ZSkge1xuICAgICAgbGV0IHVuaW9uTGVmdCA9IG5vZGUubGVmdCA/IHRoaXMudW5pb24oaSwgbm9kZS5sZWZ0KSA6IG5ldyBOb2RlKGkpXG4gICAgICByZXR1cm4gbmV3IE5vZGUobm9kZS52YWx1ZSwgdW5pb25MZWZ0LCBub2RlLnJpZ2h0KVxuICAgIH0gZWxzZSBpZiAoaSA+IG5vZGUudmFsdWUpIHtcbiAgICAgIGxldCB1bmlvblJpZ2h0ID0gbm9kZS5yaWdodCA/IHRoaXMudW5pb24oaSAtIG5vZGUudmFsdWUsIG5vZGUucmlnaHQpIDogbmV3IE5vZGUoaSAtIG5vZGUudmFsdWUpXG4gICAgICByZXR1cm4gbmV3IE5vZGUobm9kZS52YWx1ZSwgbm9kZS5sZWZ0LCB1bmlvblJpZ2h0KVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gbm9kZVxuICAgIH1cbiAgfVxuXG4gIGNvbnRhaW5zKGkpIHtcbiAgICBsZXQgbm9kZSA9IF9yb290LmdldCh0aGlzKVxuICAgIHdoaWxlIChub2RlICE9IG51bGwpIHtcbiAgICAgIGlmIChpIDwgbm9kZS52YWx1ZSkge1xuICAgICAgICBub2RlID0gbm9kZS5sZWZ0XG4gICAgICB9IGVsc2UgaWYgKGkgPiBub2RlLnZhbHVlKSB7XG4gICAgICAgIGkgLT0gbm9kZS52YWx1ZVxuICAgICAgICBub2RlID0gbm9kZS5yaWdodFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cblxuICB0b0FycmF5KG5vZGUsIGJhc2UsIHJlc3VsdCkge1xuICAgIG5vZGUgPSBub2RlID8/IF9yb290LmdldCh0aGlzKVxuICAgIGJhc2UgPSBiYXNlID8/IDBcbiAgICByZXN1bHQgPSByZXN1bHQgPz8gW11cbiAgICBpZiAobm9kZSkge1xuICAgICAgbm9kZS5sZWZ0ICYmIHRoaXMudG9BcnJheShub2RlLmxlZnQsIGJhc2UsIHJlc3VsdClcbiAgICAgIGJhc2UgKz0gbm9kZS52YWx1ZVxuICAgICAgcmVzdWx0LnB1c2goYmFzZSlcbiAgICAgIG5vZGUucmlnaHQgJiYgdGhpcy50b0FycmF5KG5vZGUucmlnaHQsIGJhc2UsIHJlc3VsdClcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gVHJlZSIsIi8vIFRoZSBtb2R1bGUgY2FjaGVcbnZhciBfX3dlYnBhY2tfbW9kdWxlX2NhY2hlX18gPSB7fTtcblxuLy8gVGhlIHJlcXVpcmUgZnVuY3Rpb25cbmZ1bmN0aW9uIF9fd2VicGFja19yZXF1aXJlX18obW9kdWxlSWQpIHtcblx0Ly8gQ2hlY2sgaWYgbW9kdWxlIGlzIGluIGNhY2hlXG5cdHZhciBjYWNoZWRNb2R1bGUgPSBfX3dlYnBhY2tfbW9kdWxlX2NhY2hlX19bbW9kdWxlSWRdO1xuXHRpZiAoY2FjaGVkTW9kdWxlICE9PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gY2FjaGVkTW9kdWxlLmV4cG9ydHM7XG5cdH1cblx0Ly8gQ3JlYXRlIGEgbmV3IG1vZHVsZSAoYW5kIHB1dCBpdCBpbnRvIHRoZSBjYWNoZSlcblx0dmFyIG1vZHVsZSA9IF9fd2VicGFja19tb2R1bGVfY2FjaGVfX1ttb2R1bGVJZF0gPSB7XG5cdFx0Ly8gbm8gbW9kdWxlLmlkIG5lZWRlZFxuXHRcdC8vIG5vIG1vZHVsZS5sb2FkZWQgbmVlZGVkXG5cdFx0ZXhwb3J0czoge31cblx0fTtcblxuXHQvLyBFeGVjdXRlIHRoZSBtb2R1bGUgZnVuY3Rpb25cblx0X193ZWJwYWNrX21vZHVsZXNfX1ttb2R1bGVJZF0obW9kdWxlLCBtb2R1bGUuZXhwb3J0cywgX193ZWJwYWNrX3JlcXVpcmVfXyk7XG5cblx0Ly8gUmV0dXJuIHRoZSBleHBvcnRzIG9mIHRoZSBtb2R1bGVcblx0cmV0dXJuIG1vZHVsZS5leHBvcnRzO1xufVxuXG4iLCJcbmNvbnN0IERvY3VtZW50ID0gcmVxdWlyZSgnLi9kb2N1bWVudCcpXG52YXIgdGV4dEVsZW1lbnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInRleHRcIilcblxudGV4dEVsZW1lbnQuc2VsZWN0aW9uU3RhcnQgPSAwXG50ZXh0RWxlbWVudC5zZWxlY3Rpb25FbmQgPSAwXG52YXIgb2xkVGV4dCA9IFwiXCJcbmxldCBkb2MgPSBuZXcgRG9jdW1lbnQoKVxuXG5mdW5jdGlvbiBjb25uZWN0ICgpIHtcbiAgd2luZG93LnNvY2tldCA9IG5ldyBXZWJTb2NrZXQoYHdzOi8vJHtsb2NhdGlvbi5ob3N0fWApXG4gIHNvY2tldC5vbmNsb3NlID0gZGlzY29ubmVjdGVkXG4gIHNvY2tldC5vbm9wZW4gPSBjb25uZWN0ZWRcbiAgc29ja2V0Lm9ubWVzc2FnZSA9IHJlY2VpdmVcbiAgc29ja2V0Lm9uZXJyb3IgPSBlcnJvck1zZ1xufVxuZnVuY3Rpb24gY29ubmVjdGVkICgpIHtcbiAgY29uc29sZS5sb2coJ0Nvbm5lY3Rpb24gRXN0YWJsaXNoZWQnKVxufVxuZnVuY3Rpb24gZGlzY29ubmVjdGVkICgpIHtcbiAgY29uc29sZS5sb2coJ0Nvbm5lY3Rpb24gTG9zdCcpXG4gIHNldFRpbWVvdXQoY29ubmVjdCwgMTAwMDApXG59XG5jb25uZWN0KClcbmZ1bmN0aW9uIGVycm9yTXNnKGVycikge1xuICBjb25zb2xlLmVycm9yKGVycilcbn1cbnRleHRFbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCBmdW5jdGlvbihldmVudCkge1xuICBsZXQgZGlmZiA9IERvY3VtZW50LmdldERpZmYob2xkVGV4dCwgdGV4dEVsZW1lbnQudmFsdWUsIHRleHRFbGVtZW50LnNlbGVjdGlvbkVuZClcbiAgbGV0IG9wcyA9IGRvYy5kaWZmVG9PcHMoZGlmZilcbiAgLy8gYXBwbHkgb3BzIGxvY2FsbHlcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBvcHMubGVuZ3RoOyBpKyspIHtcbiAgICBkb2MuYWRkKG9wc1tpXSlcbiAgfVxuICBzb2NrZXQuc2VuZChKU09OLnN0cmluZ2lmeSh7dHlwZTogJ3VwZGF0ZScsIHZhbHVlOiBvcHN9KSlcbiAgY29uc29sZS5sb2coJ29wczonICsgSlNPTi5zdHJpbmdpZnkob3BzKSlcbiAgY29uc29sZS5sb2coJ2RvY3N0YXRlOiAnICsgZG9jLnRleHQpXG4gIG9sZFRleHQgPSB0ZXh0RWxlbWVudC52YWx1ZVxufSlcbmZ1bmN0aW9uIHJlY2VpdmUgKG1lc3NhZ2UpIHtcbiAgbGV0IGRhdGEgPSBKU09OLnBhcnNlKG1lc3NhZ2UuZGF0YSlcbiAgc3dpdGNoIChkYXRhLnR5cGUpIHtcbiAgICBjYXNlICd1cGRhdGUnOlxuICAgICAgdXBkYXRlKGRhdGEudmFsdWUpXG4gICAgICBicmVha1xuICB9XG59XG5mdW5jdGlvbiB1cGRhdGUgKG9wcykge1xuICBjb25zb2xlLmxvZygnZnJvbSBzZXJ2ZXI6JyArIEpTT04uc3RyaW5naWZ5KG9wcykpXG4gIGxldCByZXYgPSBkb2Mub3BlcmF0aW9uc0NvdW50XG4gIGRvYy5sb2NhdGlvbnMgPSBbdGV4dEVsZW1lbnQuc2VsZWN0aW9uU3RhcnQsIHRleHRFbGVtZW50LnNlbGVjdGlvbkVuZF1cblxuICBmb3IgKHZhciBpID0gMDsgaSA8IG9wcy5sZW5ndGg7IGkrKykge1xuICAgIGRvYy5tZXJnZShvcHNbaV0pXG4gIH1cbiAgdGV4dEVsZW1lbnQudmFsdWUgPSBkb2MudGV4dFxuICBvbGRUZXh0ID0gdGV4dEVsZW1lbnQudmFsdWVcbiAgdGV4dEVsZW1lbnQuc2VsZWN0aW9uU3RhcnQgPSBkb2MubG9jYXRpb25zWzBdXG4gIHRleHRFbGVtZW50LnNlbGVjdGlvbkVuZCA9IGRvYy5sb2NhdGlvbnNbMV1cbn0iXSwibmFtZXMiOltdLCJzb3VyY2VSb290IjoiIn0=