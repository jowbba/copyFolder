var fs = require('fs')
var path = require('path')
var crypto = require('crypto')
var { execSync } = require('child_process')
var EventEmitter = require('events')

const folderPath = path.normalize('E:\\OneDrive')
const targetPath = path.normalize('E:\\下载拷贝测试')

// define function to copy folder-------------------------------------------------------------------------
const list = []
const tree = []
const loopA = (nodePath, list , treeNode, parentNode, callback) => {
  fs.stat(nodePath, (err, stats) => {
    if (err || (!stats.isDirectory() && !stats.isFile())) return callback(err? err: new Error(nodePath + ' is not file or folder')) 
    let type = stats.isFile()? 'file': 'folder'
    let nodeObj = { nodePath, type, children: type == 'folder'? []: null, parentNode }
    list.push(nodeObj)
    treeNode.push(nodeObj)
    if (stats.isFile()) return callback(null)
    fs.readdir(nodePath, (err, entries) => {
      if (err) return callback(err)
      if (!entries.length) return callback(null)
      let count = entries.length
      let index = 0
      const next = () => { loopA(path.join(nodePath, entries[index]), list, nodeObj.children, nodeObj, cb) }
      let cb = (err) => {
        if (err) return callback(err)
        if (++index >= count) return callback()
        next()
      }
      next()
    })
  })
}

const copyA = (toPath, callback) => {
  let index = 0
  let count = list.length
  let countCopyedFile = setInterval(() => {

  })
  let cb = (err) => {
    if (err) return callback(err)
    index++
    if (index >= count) return callback()
    else move()
  }
  let move = () => {
    let obj = list[index]
    let nodeName = path.basename(obj.nodePath)
    let parentPath = obj.parentNode? obj.parentNode.copyToPath : toPath
    let copyToPath = path.join(parentPath, nodeName)
    obj.copyToPath = copyToPath
    if (obj.type == 'folder') return fs.mkdir(copyToPath, cb)
    else if (obj.type == 'file') {
      let readStream = fs.createReadStream(obj.nodePath)
      let writeStream = fs.createWriteStream(copyToPath)
      readStream.on('error',cb)
      writeStream.on('error', cb)
      writeStream.on('finish', cb)
      readStream.pipe(writeStream)
    }
    else callback(`can not get node type ${obj.path}`)
  }
  move(toPath)
}

// console.time('loopA cost time')
// let countFolderNumber = setInterval(() => console.log(list.length), 1000)
// loopA(folderPath, list, tree, null, (err, data) => {
//   console.timeEnd('loopA cost time')
//   clearInterval(countFolderNumber)
//   if (err) console.log(err)
//   else console.log(list.length)
//   console.time(`copyA cost time`)
//   copyA(targetPath, err => {
//     console.timeEnd(`copyA cost time`)
//     if (err) console.log(err)
//   })
// })

// defind class to copy folder-------------------------------------------------------------------------------------
class Schedule extends EventEmitter {
  constructor(folderPath, targetPath) {
    super()
    this.folderPath = folderPath
    this.targetPath = targetPath
    this.currentNode = null
    this.list = []
    this.readyCopy = []
    this.copying = []
    this.finish = []
    this.limit = 20
    this.createLimit = 5
    this.pause = false
    this.loopFinish = false
    this.error = null
    this.countProcess = setInterval(() => {
      // return
      console.log(' ')
      console.log(`list length : ${this.list.length}`)
      console.log(`readyCopy length : ${this.readyCopy.length}`)
      console.log(`copying length : ${this.copying.length}`)
      console.log(`finish length : ${this.finish.length}`)
    }, 500)
  }

  begin() {
    let node = new ReadNode(this.folderPath, this.targetPath, this)
    node.on('loopFinish', () => {
      this.loopFinish = true
    })
    node.on('error', this.enterFinish.bind(this))
    node.begin()
  }

  stop() {
    this.pause = true
  }
  
  resume() {
    this.pause = false
    this.schedule()
  }

  enterFinish(err) {
    clearInterval(this.countProcess)
    if (err) {
      this.error = err
      return console.log('copy failed')
    }
    
    console.log('copy finish')
  }
  
  schedule() {
    if (this.loopFinish && this.finish.length == this.list.length) return this.enterFinish(null)
    if (this.pause) return
    if (this.error) return
    this.scheduleCopy()
    this.scheduleLoop()
  }

  scheduleCopy() {
    while (this.readyCopy.length > 0 && this.copying.length < this.createLimit) {
      // console.log('schedule copy')
      if (this.readyCopy[0].state !== 'readed') break
      let nodeObj = this.readyCopy.splice(0,1)[0]
      this.copying.push(nodeObj)
      nodeObj.copy()
    }
  }

  scheduleLoop() {
    if (this.readyCopy.length < this.limit && this.currentNode.state == 'readed') {
      // console.log('schedule loop')
      return this.currentNode.next()
    }
  }
}

class ReadNode extends EventEmitter {
  constructor(nodePath, targetPath, schedule) {
    super()
    this.nodePath = nodePath
    this.targetPath = targetPath
    this.schedule = schedule
    this.entries = []
    this.children = []
    this.index = 0
    this.count = null
    this.state = 'ready'
    this.type = null
  }
  
  begin() {
    // console.log(' ')
    // console.log(this.nodePath)
    this.schedule.currentNode = this
    this.readNode()
  }

  readNode() {
    this.state = 'readNode'
    fs.stat(this.nodePath, (err, stats) => {
      // error handling
      if (err || (!stats.isDirectory() && !stats.isFile())) {
        this.state = 'error'
        return this.emit('error', err? err: new Error(`${this.nodePath} is not file or folder`))
      }
      // insert node object
      this.type = stats.isFile()? 'file': 'folder'
      this.schedule.list.push(this)
      this.schedule.readyCopy.push(this)
      // dispatch schedule after reading file or folder
      if (stats.isDirectory()) {
        fs.readdir(this.nodePath, (err, entries) => {
          this.entries = entries
          this.count = entries.length
          this.back()
        })
      }else this.back()
      
    })
  }

  back() {
    this.state = 'readed'
    this.schedule.schedule()
  }

  next() {
    // this.state = 'readNext'
    //emit loopFinish after all children of node have been read 
    if (this.type === 'file' || this.index >= this.count) return this.emit('loopFinish')
    // console.log(`enter next child object ${this.index} -- ${this.count}`)
    let nextName = this.entries[this.index]
    let nextPath = path.join(this.nodePath, nextName)
    let nextTargetPath = path.join(this.targetPath, nextName)
    let node = new ReadNode(nextPath, nextTargetPath, this.schedule)
    node.on('loopFinish', this.cb.bind(this))
    node.on('error', err => this.emit('error'))
    node.begin()
  }

  cb(err) {
    if (err) return this.emit(err)
    // a child has been loop finish, return control to parent node
    // console.log('backto ' + this.nodePath)
    this.index += 1
    this.schedule.currentNode = this
    this.schedule.schedule()
  }

  copy() {
    if (this.type == 'file') {
      let readStream = fs.createReadStream(this.nodePath)
      let writeStream = fs.createWriteStream(this.targetPath)
      readStream.on('error', this.copyFinish.bind(this))
      writeStream.on('error', this.copyFinish.bind(this))
      writeStream.on('finish', this.copyFinish.bind(this))
      readStream.pipe(writeStream)
    }else if (this.type == 'folder') {
      return fs.mkdir(this.targetPath, this.copyFinish.bind(this))
    }
  }

  copyFinish(err) {
    if (err) return this.emit('error', err)
    let index = this.schedule.copying.indexOf(this)
    if (index == -1) this.emit('error', new Error('can not found node object in copying list of schedule'))
    this.schedule.finish.push(this.schedule.copying.splice(index, 1))
    this.schedule.schedule()
  }
}

let schedule = new Schedule(folderPath, path.join(targetPath, path.basename(folderPath)))
schedule.begin()