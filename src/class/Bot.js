const { MongoClient, Int32 }  = require("mongodb")
const colors = require('colors')
const Collector = require('./Collector')
const Utils = require('./Utils')



const DEFAULT_GROUP_IDS = [57846937]
const MONGO_DB_NAME_DEFAULT = 'storybot'


class Bot {

  constructor (dbSetup = {}) {
    this.bots = [];
    
    if (!dbSetup.urlDb) dbSetup.urlDb = 'mongodb://localhost:27017/'

    if (dbSetup.log !== undefined && typeof dbSetup.log !== "function") {
      throw new Error('Log function must be only of function type')
    }

    if (dbSetup.command !== undefined && typeof dbSetup.command !== "function") {
      throw new Error('Command handler function must be only of function type')
    } 

    this.dbName = dbSetup.dbName || '';
    this.options = dbSetup;
    this.state = {
      stopped: false
    }

    this.mongoClient = new MongoClient(dbSetup.urlDb, { 
      useNewUrlParser: true
    });
  }


  addBot (configurationBot = {}) {

    configurationBot = this._checkConfigBot(configurationBot)
     
    this.bots.push(configurationBot)
  }


  _checkConfigBot (configurationBot = {}) {
    if (!Array.isArray(configurationBot.viewers)) throw 'viewers property must be array'
    if (!configurationBot.collector || !(configurationBot.collector instanceof Collector)) throw 'collector property must be Collector class'
    if (!configurationBot.groupIds || !Array.isArray(configurationBot.groupIds)) configurationBot.groupIds = DEFAULT_GROUP_IDS 
    
    if (!configurationBot.name) throw 'name property must be string'

    return configurationBot
  }

  _command (...args) {
    if (this.options && this.options.command) this.options.command(...args)

    if (args[0] === "collector") {
      switch (args[1]) {
        case 'stop_process':
          this.state.stopped = true;
          break;
      }
    }

  }

  _log (...args) {
    if (this.options && this.options.log) return this.options.log(...args)

    return console.log(String('[timestamp(' + Math.floor(new Date().getTime() / 1000) + ')] ').yellow, ...([...args].map(a => {
      let ca = a.toString()
      return (ca.match(/^\[Error\]/)) ? ca.red : 
      (ca.match(/^\[Info\]/)) ? ca.cyan : ca.white; 
    })))
  }

  async startBots () {
    let self = this;

    return new Promise(async (resolve, reject) => {
      
      self.mongoClient.connect(async (err, client) => {
        
        self._log('Connected to db')

        if (err) throw err;
         
        self.db = client.db(self.dbName || MONGO_DB_NAME_DEFAULT)


        /** groups indexes **/
        self. db.collection("groups").createIndex({
          "_id": Int32(1)
        },[
          
        ]);

        /** users indexes **/
        self.db.collection("users").createIndex({
          "_id": Int32(1)
        },[
          
        ]);

        /** viewers indexes **/
        self.db.collection("viewers").createIndex({
          "_id": Int32(1)
        },[
          
        ]);

        await Utils.asyncLoop(self.bots.length, async (loop) => {
          
          let bot = self.bots[loop.iteration];
          
          await Utils.asyncLoop(bot.viewers.length, async (viewerLoop) => {
            let viewer = bot.viewers[viewerLoop.iteration]
              
            // console.log(bot.botName, 'botName')
            viewer.botName = bot.name
            viewer.db = self.db
            
            viewer.controllerState = self.state;

            viewer._log = (...args) => {
              self._log('(Viewer)\n'.cyan, ...args)
            }

            viewer._command = (...args) => {
              self._command('viewer', viewer._vk.session.user_id, ...args)
            }

            await bot.viewers[viewerLoop.iteration].init()

            viewerLoop.next()

          })

          bot.viewers.forEach((viewer) => {
            bot.collector.addUserToken(viewer._vk.session.access_token)
          })

          bot.collector.addGroupIds(bot.groupIds)
          bot.collector.botName = bot.name
          bot.collector.db = self.db
          bot.collector._log = (...args) => {
            self._log('(Collector)\n'.cyan, ...args)
          }

          bot.collector._command = (...args) => {
            self._command('collector', 0, ...args)
          }

          loop.next()

        })

        self.bots.forEach((bot) => {
          bot.collector.run()

        })

      })  


      resolve(true)

    })

  }

}


module.exports = Bot;