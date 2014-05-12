/*
 Connected Backbone dualStorage Adapter forked from Backbone.dualStorage v1.1.0, drop in replacement

 Extends dualStorage to work with mobile apps, support should be added via collection properties. This was designed
 for use with a Backbone Phonegap app.

 dualSync = sync online / offline - do both online and offline, enables ®return etc
 remote = fetch remote - remote only ( default behaviour, ignores local cache if dualSync is false
 local = fetch local - local only if remote and dualSync disabled
 returns =  default is remote if remote and online and no dirty data otherwise local
 isOnline = defaults to navigator.onLine but who capitalizes the L in online! Doesn't try to make requests, does same as if error 0

 not isOnline can be passed a function for use with native html5 apps, eg phonegap.
 */
/*jslint plusplus: true */
(function () {
    "use strict";

    var S4, Store, backboneSync, callbackTranslator, dualsync, localsync, modelUpdatedWithResponse, onlineSync, parseRemoteResponse, result;
    // define globals to shut lint up
    var debug = window.debug ? window.debug : window.console ,
        _ = window._,
        $ = window.$,
        Backbone = window.Backbone,
        localStorage = window.localStorage;


    // contains client key to remote key values
    var _keys = {},
        _isSyncing = false,
        _isRefreshing = false,
        _deferred, // this is a package global to ensure one sync queue at a time
        _lastActive,
        TIMEOUT = 10000;

    Backbone.connectid = {
        // returns a promise or false
        isSyncing : function () {
            // check for active ajax requests to prevent getting stuck
            if ( _isSyncing) {
                if ($.active || $.ajax.active ) {
                    _lastActive = new Date();
                } else if ( ( new Date() ) .getTime() - _lastActive.getTime() > TIMEOUT  ) {
                    this.stoppedSyncing( 'timeout ' + ( ( new Date() ) .getTime() - _lastActive.getTime() ), false );
                }
            }
            return _isSyncing ? _deferred.promise() : false;
        },
        /*
         * resets syncing flag and clears syncing config of ajax request mode ( ie sync to async );
         * @param {string} message for debugging
         * @param {boolean} success / fail for promises, default true
         */
        stoppedSyncing : function ( msg, success ) {
            if (typeof success !== 'boolean') success = true;
            debug.log( 'stopped syncing', _isSyncing, msg , success);
            if ( _isSyncing === true ) {
                _isSyncing = false;
                if ( success ) {
                    $.ajaxSetup( { async: true} );
                    _deferred.resolve();
                } else {
                    $.ajaxSetup( { async: true} );
                    _deferred.reject();
                }
            }
        },
        startedSyncing : function ( msg ) {
            $.ajaxSetup( { async: false} );
            debug.log( 'started syncing', _isSyncing, msg );
            _lastActive = new Date();
            // reset the keys as should have all been used by now
            if ( !_isSyncing ) {
                // if these are not reset memory usage could grow over time
                _keys = {};
                _deferred = new $.Deferred();
                _isRefreshing = false; // if we start getting errors we force a refresh at the end of the run
            }
            _isSyncing = true;
            return _deferred.promise();
        },
        whenSynced : function ( successFn , failFn ) {
            if ( _isSyncing ) {
                return successFn();
            }
            if (failFn) {
                _deferred.done( successFn );
                _deferred.failed( failFn );
            } else {
                _deferred.always( successFn );
            }
            return _deferred.promise();
        }
    };


    /*
     * returns true if id matches regex pattern which implies it's a temporary local key
     * @param string id to test
     * TODO: should unit test this
     */
    function isClientKey( id ) {
        return (!!id && id.length === 36 && id.match( /-/g ).length === 4);
    }
    /*

     /*
     * removes item from comma separated list
     * @param {string} list comma separated
     * @param {string} item
     * @returns {string}
     */
    function _removeItem (inList , item) {
        var outList = '';
        if ( inList && item ) {
            outList = ( inList + ',' ).replace( item + ',' , '' );
            if ( outList.length ) {
                // strip trailing comma
                outList = outList.substring(0, outList.length-1 );
            }
        } else {
            outList = inList || '';
        }
        return outList;
    }
    /*
     * deletes old dirty record and returns the new key for the model so as to keep local collection in sync
     */
    function _cleanupDirtyModel (collection, model , response, options) {
        var newKey, jerryHall, url, dirtyList;

        url = collection.url || model.url;
        // on updates model.url is function that points to actual url called
        if ( typeof model.url !== 'string' ) {
            url = model.urlRoot || collection.model.prototype.urlRoot || collection.model.prototype.url;
        }
        dirtyList = localStorage.getItem( '' + url + '_dirty' );
        // remove from the dirty list regardless of key type
        dirtyList = _removeItem ( dirtyList, model.jerryHallId || model.id );
        if (dirtyList && dirtyList.length) {
            localStorage.setItem( '' + url + '_dirty', dirtyList );
        } else {
            localStorage.removeItem( '' + url + '_dirty' );
        }
        // if the id has not changed then no response from the server so no copy to delete
        if ( model.jerryHallId && model.jerryHallId !== model.id) {
            newKey = model.id;
            // remove key from dirty list
            // delete dirty (temp) version and update keys array to value from backend
            //old model
            jerryHall = collection.find ( function ( doc ) { return doc.jerryHallId && doc.jerryHallId === model.jerryHallId && doc.id !== newKey;  });
            if ( jerryHall) {
                debug.log('destroying', model.jerryHallId , response, options);
                jerryHall.destroy({  local: true, remote: false, dualSync: false, cleanDirty: true } ); // new models have destroy overridden for offline create and delete, cleanDirty disables this
                collection.remove( jerryHall , { local: true, remote: false, dualSync: false , silent:true }  );
            } else {
                // remove url manually from local storage
                options.store.destroy( { id: model.jerryHallId} );
            }
            // well I never new that null is defined as a type of object
            if ( typeof response === 'object' && response ) {
                newKey = response[ ( model.idAttribute || 'id') ] || newKey;
            }
        }
        return newKey;
    }

// TODO: Could be smarter by grouping posts in first batch and then doing updates once post has resolved
    Backbone.Collection.prototype.syncDirty = function () {
        var id, ids, model, store, url, _i, _len, _results, _successFn, _errorFn, _destroyFn,
            that = this;
        /* TODO is this an AJAX success and not a backbone success function in which case it may be function( resp , xhr, options ) {
         if so we'll need to straighten a load of stuff back out - i think its only called internally by localsync on success which
         handles the ajax and updates the model, otherwise we can put the model and collection in scope*/
        _successFn = function ( model, response , options ) {
            var newKey;
            // need to refresh store as scope create when original request was made
            options.store = new Store ( options.store.name );
            // if the model has jerryHallId that's the id backbone was using
            // we can now swap this out from its stub value to the one id created remotely
            newKey = _cleanupDirtyModel ( that , model , response , options );
            if ( newKey ) {
//              debug.log( 'mapping', model.jerryHallId, 'to', newKey );
                _keys[ model.jerryHallId ] = newKey ;
                delete model.jerryHallId;
            }
            console.log ('synced',model.id,localStorage.getItem(model.url + '_dirty') );
            // cleaning up
            delete model.url;
            delete model.dirtySync;
            delete model.jerryHallId;
        };
        _errorFn = function( model, xhr, options ) {
            console.log ('sync error', model);
            // need to refresh store as scope create when original request was made
            options.store = new Store ( options.store.name );
            // remove dirty if error returned from backend, if status is 0 then that means the server timed out so should try again
            if ( xhr && xhr.status ) {
                _cleanupDirtyModel( that, model , null , options );
                // logs to local storage, does not retry just there for debugging
                var errors = localStorage.getItem('sync error') || [];
                if ( errors.length ) errors = JSON.parse ( errors);
                errors.push ( [ model.url + '_dirty', xhr ] );
                localStorage.setItem( 'sync error' , JSON.stringify( errors  ));
                debug.log( 'sync error', model.url + '_dirty', xhr );
                // clear out dirty cache
                // call cleanup dirty model so item is not done again
                _cleanupDirtyModel ( that, model , null , options );
                // need to do a refresh after syncing complete to straighten things out
                if (!_isRefreshing) {
                    that.fetch( { returns : 'remote',
                        // attempt to reload the current route
                        success : function () {
                            window.setTimeout( function () {
                                try {
                                    var frag = Backbone.history.fragment;
                                    debug.log( 'router refresh on error', frag );
                                    Backbone.history.fragment = null;
                                    Backbone.history.navigate( frag, true );
                                } catch ( err ) {
                                    debug.log( 'unable to refesh router after error with', that, err );
                                }
                            })
                        }
                    } );
                }
                _isRefreshing = true;
            } else {
                Backbone.connectid.stoppedSyncing( 'sync ajax timeout' );
            }
            delete model.url;
            delete model.dirtySync;
            delete model.jerryHallId;
        };
        // allows new models to be immediately destroyed on sync if !cleanDirty
        _destroyFn = function ( model , url , id ) {
            var _oldDestroy = model.destroy;
            return function ( options ) {
                if ( typeof options !== 'object' || !options.cleanDirty) {
                    // we have to manually do this because won't exist in local store
                    // the _keys mapping will be used to remove new
                    var destroyList = localStorage.getItem( '' + url + '_destroyed' ) || '';
                    // will use keys table to delete offending model
                    console.log( 'deferred destroy', this.get( 'name' ), url, id );
                    if (destroyList) destroyList +=',';
                    destroyList += id;
                    localStorage.setItem( '' + url + '_destroyed' , destroyList );
                }
                _oldDestroy.apply( this, arguments );
            }
        };
        url = result( this, 'url' );
        store = localStorage.getItem( '' + url + '_dirty' );
        ids = (store && store.split( ',' )) || [];
        console.log ('dirt store', Backbone.connectid.isSyncing(), url, store,ids  );
        _results = [];
        for ( _i = 0, _len = ids.length; _i < _len; _i++ ) {
            id = ids[_i];
            Backbone.connectid.startedSyncing( this.url + '/' + id);
            debug.log( 'syncing dirty', _i, _len, id, this );
            model = this.get( id );
            if ( !model ) {
                store = _removeItem (store, id  );
                if (store.length) {
                    localStorage.setItem( '' + url + '_dirty', store );
                } else {
                    localStorage.removeItem( '' + url + '_dirty' );
                }
                debug.log( 'dirty model id did not exist [' + id + '] , cleared' );
            } else {
                // if the model is new (has a backbone id) then remove the id so creates new record
                // the local cache is cleared when the data is refreshed from server
                debug.log( 'syncing for C or U', model, model.idAttribute, model.get( model.idAttribute ), isClientKey( model.get( model.idAttribute ) ), this );
                if ( isClientKey( id ) ) {
                    // have we already got a key mapping for this id, eg created already in this batch and now updating
                    if ( typeof _keys[id] === 'undefined' ) {
                        // and remove the id so posts new
                        // this is now done in dualSync as otherwise you have records in collection without ids
                        // remove temporary id on new record creation
//                        if ( model.idAttribute ) model.unset( model.idAttribute );
//                        delete model.id;
//                    debug.log( 'new model', model );
                        model.jerryHallId = id;
                        // this creates a stub which may get referenced by later requests if fired sequentially, eg create then update or as a foreign key
                        _keys[id] = 'stub' + _i;
                    } else {
                        if ( this.model.prototype.idAttribute ) model.set( this.model.prototype.idAttribute, _keys[id] );
                        // and remove the id so posts new
                        model.id = _keys[id];
                    }
//                    model.url = url;
                    model.dirtySync = true;
                    // enable immediate delete before syncing otherwise backbone will ignore as no id set
                    model.destroy = _destroyFn ( model, url , id );
                } else {
                    debug.log ('updating',_i, model.id , _len);
                }
                model.urlRoot = url;

                //TODO: refactor this hack to force call order or just remove this async = true line
                //as this can freeze the UI, should just use promises to chain async requests together
                // model.save
                _results.push( model.save( null,
                        { success : _successFn,
                            error : _errorFn,
                            dualSync : true,
                            remote : true,
                            isSyncRequest: true,
                            async : false
                        })
                );
            }
        }
        return _results;
    };
    Backbone.Collection.prototype.syncDestroyed = function () {
        var id, ids, model, destroyList, url, _i, _len, _results, param = {},
            that = this;
        url = result( this, 'url' );
        var destroyList = localStorage.getItem( '' + url + '_destroyed' );
        ids = (destroyList && destroyList.split( ',' )) || [];
        _results = [];

        function _removeDestroyed ( modelId ) {
            var destroyList = localStorage.getItem( '' + url + '_destroyed' );
            destroyList = _removeItem( destroyList, modelId );
            debug.log ('removing', modelId , destroyList )
            // remove error producing model from dirty list
            if ( destroyList && destroyList.length ) {
                localStorage.setItem( '' + url + '_destroyed', destroyList );
            } else {
                localStorage.removeItem( '' + url + '_destroyed' );
            }
        }

        // TODO is this an AJAX success function?
        function _successFn ( model , response, options ) {
            debug.log( 'success deleted ' + url, model);
            _cleanupDirtyModel( that, model , response , options );
            _removeDestroyed ( model.destroyId || id );
            // if this not superfluos if model has been destroyed?
            delete model.destroyId;
            delete model.url;
            delete model.dirtySync;
        }
        function _errorFn ( model, xhr, options ) {
            // remove dirty if error returned from backend, if status is 0 then that means the server timed out so should try again
            if ( xhr && xhr.status ) {
                debug.log( 'error deleting ' + url , xhr );
                _cleanupDirtyModel( that, model , response , options );
                _removeDestroyed ( model.id );
                delete model.dirtySync;
                delete model.url;
            }
        }
        console.log ('destr store', Backbone.connectid.isSyncing(), url,ids  );
        for ( _i = 0, _len = ids.length; _i < _len; _i++ ) {
            id = ids[_i];
            // check its not a remapped client key, from a create and delete offline
            id = _keys[id] || id;
            Backbone.connectid.startedSyncing( url + '/' + id);
            // remove model
            if ( this.model.prototype.idAttribute ) {
                param[this.model.prototype.idAttribute] = id;
            } else {
                param.id = id;
            }
            // need to add a model so it can be destroyed again unless this is an immediate destroy
            model = this.get('id');
            if ( !model ) {
                model = this.add( param, { validate : false /*,silent: true* is this stopping models getting deleted*/ } );
                model.urlRoot = url;
            }
            model.destroyId = ids[_i];

            Backbone.connectid.startedSyncing( 'delete ' + url + '/' + id);
            _results.push( model.destroy( {
                success : _successFn,
                error : _errorFn,
                dualSync : true,
                remote : true,
                isSyncRequest: true,
                async : true
            } ) );
        }
//  see note above, we want to ensure that whilst in process of syncing we see old data until updates have completed    
//    localStorage.removeItem('' + url + '_destroyed');
        return _results;
    };
    /*
     * @returns array of xhr requests generated
     */
    Backbone.Collection.prototype.syncDirtyAndDestroyed = function () {
        var models, dirty,
            Model = this.model || Backbone.Model,
            collection = this;
        // makes a model out of an object so can be put into backbone collection
        function _modeller ( model ) {
            if ( ! (model instanceof Backbone.Model) ) {
                model = new Model( model );
            }
            collection.add ( model , { silent: true } );
        }
        // if called before local copy loaded then do a localSync first
        if ( !this.models.length ) {
            models = this.fetch( { dirtyLoad : true, ignoreCallbacks : true } ) || [];
            models.forEach( _modeller );
        }
        dirty = this.syncDirty();
        return _.union( dirty, this.syncDestroyed() );
    };

    S4 = function () {
        //noinspection JSHint
        return (((1 + Math.random()) * 0x10000) | 0).toString( 16 ).substring( 1 );
    };

    Store = (function () {
        var Store = function ( name ) {
            this.name = name;
            this.records = this.recordsOn( this.name );
        };

        Store.prototype.sep = '/';


        Store.prototype.generateId = function () {
            return S4() + S4() + '-' + S4() + '-' + S4() + '-' + S4() + '-' + S4() + S4() + S4();
        };

        Store.prototype.save = function () {
            // make sure there are no duplicate ids if items are added twice somehow
            return localStorage.setItem( this.name, _.uniq( this.records ).join( ',' ) );
        };

        Store.prototype.recordsOn = function ( key ) {
            var store;
            store = localStorage.getItem( key );
            return (store && store.split( ',' )) || [];
        };

        Store.prototype.dirty = function ( model ) {
            var dirtyRecords;
            if ( model && model.id) {
                dirtyRecords = this.recordsOn( this.name + '_dirty' );
                if ( !_.include( dirtyRecords, model.id.toString() ) ) {
                    dirtyRecords.push( model.id );
                    localStorage.setItem( this.name + '_dirty', dirtyRecords.join( ',' ) );
                }
            }
            return model;
        };

        Store.prototype.clean = function ( model, from ) {
            var dirtyRecords, store;
            store = '' + this.name + '_' + from;
            dirtyRecords = this.recordsOn( store );
            if ( _.include( dirtyRecords, model.id.toString() ) ) {
                localStorage.setItem( store, _.without( dirtyRecords, model.id.toString() ).join( ',' ) );
            }
            return model;
        };

        Store.prototype.destroyed = function ( model ) {
            var destroyedRecords;
            destroyedRecords = this.recordsOn( this.name + '_destroyed' );
            if ( !_.include( destroyedRecords, model.id.toString() ) ) {
                destroyedRecords.push( model.id );
                localStorage.setItem( this.name + '_destroyed', destroyedRecords.join( ',' ) );
            }
            return model;
        };

        Store.prototype.create = function ( model, recursive ) {
            if ( !_.isObject( model ) ) {
                return model;
            }
            if ( model instanceof Backbone.Collection ) {
                // seems to have a problem when only one record returned
                if ( recursive ) throw new Error( 'nested collections cannot be stored' );
                var that = this;
                _.each( model.models, function ( inModel ) {
//          debug.log ('recursive create',inModel);
                    that.create( inModel, true );
                } );
                return model;
            }

            if ( !model.id ) {
                model.id = this.generateId();
                model.set( model.idAttribute, model.id );
            }
//      debug.log('storing', this.name + this.sep + model.id, JSON.stringify(model), model);
            localStorage.setItem( this.name + this.sep + model.id, JSON.stringify( model ) );
            // check its not already there
            this.records.push( model.id.toString() );
            this.save();
            return model;
        };

        Store.prototype.update = function ( model ) {
            var id = model.id;
            if ( id ) {
                // convert to string
                id += '';
                localStorage.setItem( this.name + this.sep + id, JSON.stringify( model ) );
                if ( !_.include( this.records ) ) {
                    this.records.push( id );
                }
                this.save();
            }
            return model;
        };

        Store.prototype.clear = function () {
            var id, _i, _len, _ref;
            _ref = this.records;
            //noinspection JSHint,JSHint,JSHint
            for ( _i = 0, _len = _ref.length; _i < _len; _i++ ) {
                id = _ref[_i];
                localStorage.removeItem( this.name + this.sep + id );
            }
            this.records = [];
            return this.save();
        };

        Store.prototype.hasDirtyOrDestroyed = function () {
//      debug.log('dirty check ', this.name + '_dirty' , localStorage.getItem(this.name + '_dirty') , !_.isEmpty(localStorage.getItem(this.name + '_dirty')) );
            return !_.isEmpty( localStorage.getItem( this.name + '_dirty' ) ) || !_.isEmpty( localStorage.getItem( this.name + '_destroyed' ) );
        };

        Store.prototype.find = function ( model ) {
            return JSON.parse( localStorage.getItem( this.name + this.sep + model.id ) );
        };

        Store.prototype.findAll = function () {
            var id, _i, _len, _ref, _results, result;
            _ref = this.records;
            _results = [];
            debug.log ('storage',window.localStorage);
            for ( _i = 0, _len = _ref.length; _i < _len; _i++ ) {
                id = _ref[_i];
                result = localStorage.getItem( this.name + this.sep + id );
//              debug.log ('findAll',_i,id,result);
                if (result) _results.push( JSON.parse( result ) );
            }
            return _results;
        };

        Store.prototype.destroy = function ( model ) {
            var id = model.id || model.get ( model.idAttribute || 'id' );
            if (id) {
                localStorage.removeItem( this.name + this.sep + id );
                this.records = _.reject( this.records, function ( recordId ) {
                    return recordId === id.toString();
                } );
                this.save();
            }
            return model;
        };

        return Store;

    })();
    window.Store = Store;

    callbackTranslator = {
        needsTranslation : Backbone.VERSION === '0.9.10',
        forBackboneCaller : function ( callback ) {
            if ( this.needsTranslation ) {
                return function ( model, resp, options ) {
                    return callback.call( null, resp );
                };
            } else {
                return callback;
            }
        },
        forDualstorageCaller : function ( callback, model, options ) {
            if ( this.needsTranslation ) {
                return function ( resp ) {
                    return callback.call( null, model, resp, options );
                };
            } else {
                return callback;
            }
        }
    };

    localsync = function ( method, model, options ) {
        var isValidModel, preExisting, response, store;
        isValidModel = (method === 'clear') ||
            (method === 'hasDirtyOrDestroyed') ||
            model instanceof Backbone.Model ||
            model instanceof Backbone.Collection;

        if ( !isValidModel ) {
            throw new Error( 'model parameter is required to be a backbone model or collection.' );
        }
        // refresh the store for when syncing
        store = new Store (options.storeName);
        response = (function () {
            switch ( method ) {
                case 'read':
                    if ( model.id ) {
                        return store.find();
                    } else {
                        return store.findAll();
                    }
                    break;
                case 'hasDirtyOrDestroyed':
                    return store.hasDirtyOrDestroyed();
                case 'clear':
                    return store.clear();
                case 'create':
                    if ( !(options.add && !options.merge && (preExisting = store.find( model ))) ) {
                        model = store.create( model );
                        if ( options.dirty ) {
                            store.dirty( model );
                        }
                        return model;
                    } else {
                        return preExisting;
                    }
                    break;
                case 'update':
                    store.update( model );
                    if ( options.dirty ) {
                        return store.dirty( model );
                    } else {
                        return store.clean( model, 'dirty' );
                    }
                    break;
                case 'delete':
                    store.destroy( model );
                    if ( options.dirty ) {
                        return store.destroyed( model );
                    } else {
                        if ( isClientKey( model.id ) ) {
                            return store.clean( model, 'dirty' );
                        } else {
                            return store.clean( model, 'destroyed' );
                        }
                    }
            }
        })();

        if ( typeof response === 'object' && response.attributes ) {
            response = response.attributes;
        }

        if ( !options.ignoreCallbacks ) {
            if ( response ) {
                options.success( response );
            } else {
                options.error( 'Record not found' );
            }
        }
        return response;
    };

    result = function ( object, property ) {
        var value;
        if ( !object ) {
            return null;
        }
        value = object[property];
        if ( _.isFunction( value ) ) {
            return value.call( object );
        } else {
            return value;
        }
    };

    parseRemoteResponse = function ( object, response ) {
        if ( !(object && object.parseBeforeLocalSave) ) {
            return response;
        }
        if ( _.isFunction( object.parseBeforeLocalSave ) ) {
            return object.parseBeforeLocalSave( response );
        }
    };

    modelUpdatedWithResponse = function ( model, response ) {
        var modelClone;
        modelClone = model.clone();
        modelClone.set( modelClone.parse( response ) );
        return modelClone;
    };

    backboneSync = Backbone.sync;

    onlineSync = function ( method, model, options ) {
        options.success = callbackTranslator.forBackboneCaller( options.success );
        options.error = callbackTranslator.forBackboneCaller( options.error );
        // add collection if model doesn't have it, this can happen as scope changes when updating after sync
        if ( model instanceof Backbone.Model && !model.collection && options && options.collection ) {
            model.collection = options.collection;
        }
        return backboneSync( method, model, options );
    };


    // model contains the model being CUD so collection is in model.collection
    // if reading then called in collection context so collection model then conatins models
    // our config is stored in the collection prototype
    dualsync = function ( method, model, options ) {
        var error, local, originalModel, success , returned , dirty, dirtyModel , hooks, _success,
            collection = model.collection || this;
        options = options || {};
        options.collection = collection;

        /*
         this does a load of XHRs and calls a callback when xhrs are fulfilled, returns the promise.
         */
        function _doXHRs ( hooks, successFn, errorFn ) {
            if ( !hooks || !hooks.length ) {
                var _syncingFeeling = !options.isSyncRequest && Backbone.connectid.isSyncing();
                // if already syncing wait for that to finish before doing this update
                if ( _syncingFeeling ) {
                    return _syncingFeeling.then( function () {
                        var clone =  model.clone();
                        if ( typeof model.originalModel === 'object' ) {
                            model.attributes = model.originalModel.attributes;
                            model.set ( model.idAttribute || 'id', clone.id );
                            if ( model.id && _keys [ model.id ] ) {
                                debug.log( 'swapping ids', model.id, model.id );
                                model.set( model.idAttribute || 'id', _keys [ model.id ] );
                            }
                        }

                        debug.log('sync finished',method,model,options);
                        return successFn( method, model, options );
                    });
                } else {
                    return successFn( method, model, options );
                }
            } else {
                debug.log('promise when',hooks.length,successFn.toString());
                // sync after dirty business taken care of
                return $.when.apply( $ , hooks ).then( function () {
                        debug.log('promise fulfilled',method,model,options);
                        Backbone.connectid.stoppedSyncing( 'promise fulfilled' );
                        return successFn( method, model , options );
                    } ,
                    function () {
                        Backbone.connectid.stoppedSyncing( 'promise failed' );
                        if (errorFn) return errorFn ( method, model, options );
                    }
                );
            }
        }

        options.storeName = result( collection, 'url' ) || result( model, 'url' );
        options.store = new Store ( options.storeName );

        // dirtyLoad option offers route to fetch dirty records for sync before fetch, needs store / name
        if ( options.dirtyLoad ) {
            return localsync( method, model, options );
        }

        options.success = callbackTranslator.forDualstorageCaller( options.success, model, options );
        options.error = callbackTranslator.forDualstorageCaller( options.error, model, options );

        options.remote = options.remote || result( model, 'remote' ) || result( collection , 'remote' );
        options.local = options.local || result( model, 'local' ) || result( collection , 'local' );

        // indicates currently online, can be a function, defaults to navigator.Online
        options.isOnline =  options.isOnline ||
            result( collection, 'isOnline' );
        if (typeof options.isOnline !== 'boolean') {
            if (typeof options.isOnline === 'string') {
                options.isOnline = !(!options.isOnline || options.isOnline === 'NONE' );
                // use html5 if available
            } else if  ( typeof navigator !=='undefined') {
                options.isOnline = navigator.onLine;
                // default to online
            } else {
                options.isOnline = true;
            }
        }
        // if not online then reset syncing, this is a bit of a failsafe should something go wrong
        if ( !options.isOnline ) {
            Backbone.connectid.stoppedSyncing('offline');
        }
        // dual syncing only happens when online, can be passed as am option or on collection
        options.dualSync = options.isOnline &&
            ( options.dualSync  ||
                result( collection, 'dualSync' ) ||
                result( collection, 'remote' ) && result( collection, 'local' ) );
        // if not got local results then defaults to remote sync regardless of returns - this is to force
        // fetch and wait on first init
        if ( options.returns || options.remote && !options.store.records.length ) {
            options.returns = 'remote';
        } else {
            options.returns = options.returns ||
                result( collection, 'returns' ) ||
                'local';
        }

        if ( typeof options.isOnline === 'function' ) options.isOnline = options.isOnline();

        debug.log('dualSync', !!Backbone.connectid.isSyncing() , method,  model, options );

        // single sync, simple mode
        if ( options.fetchLocal || !options.isOnline || !options.dualSync ) {
            // if there is no local copy then always tries remote, regardless off isOnline - this is default BackBone behaviour
            if ( !options.fetchLocal &&
                ( options.isOnline &&
                    options.remote ) ) {
                // todo: do we need to save local copy if local is set?
                return onlineSync( method, model, options );
            } else {
                // sets the dirty flag on any changes made in local mode if dualSync
                if ( options.local ) {
                    options.dirty = options.dirty || options.dualSync || ( collection && collection.dualSync);
                    return localsync( method, model, options );
                } else {
                    // no local or remote sync, implies not using dualSync features - eg online validate
                    return onlineSync( method, model, options );
                }
            }
        } else {
            // in dual sync mode, ignoreCallbacks for local syncing as will be done remotely
            options.ignoreCallbacks = true;
            success = options.success;
            error = options.error;
            // check if we have dirty records to deal with
            dirty = localsync( 'hasDirtyOrDestroyed', model, options );
            // isSyncing indicates sync in progress, if so don't add to the queue, this is probably a recursive create
            if (  !Backbone.connectid.isSyncing()  && dirty) {
                // is this an action on a dirty model if so we can update and call sync
                dirtyModel = !model.id || isClientKey( model.id );
                if ( dirtyModel) {
                    // set dirty or it will be cleaned from the dirty list and not synced - TODO: WHAT IS THIS?
                    returned = localsync( method, model, _.extend ( options, { dirty: true && (method !=='delete' ) } ) );
                }
                debug.log ('calling syncDirty');
                hooks = collection.syncDirtyAndDestroyed();
            }
            switch ( method ) {
                // if got unsynced local changes will return local copy only
                case 'read':
                    if ( options.returns=== 'local' || dirty ) {
                        returned = localsync( method, model, options );
                    }
                    // clear and refresh local model on refresh, what if there is already a success method?
                    options.success = function ( resp, status, xhr ) {
                        //debug.log ('not dirty',model);
                        var collection, modelAttributes, responseModel, _i, _len;
                        resp = parseRemoteResponse( model, resp );
                        // refreshes local copy unless you set the add option, PC - now disabled as seems to be set on callback by Backbone after syncing
                        if ( resp /* && !options.add */ ) {
                            localsync( 'clear', model, options );
                            // assumes response is a collection if returned an array
                            if ( resp instanceof Array ) {
                                collection = model;
                                for ( _i = 0, _len = resp.length; _i < _len; _i++ ) {
                                    modelAttributes = resp[_i];
                                    responseModel = modelUpdatedWithResponse( new collection.model(), modelAttributes );
                                    localsync( 'create', responseModel, options );
                                }
                            } else {
                                responseModel = modelUpdatedWithResponse( new model.constructor(), resp );
                                localsync( 'create', responseModel, options );
                            }
                        }
                        return _success( resp, status, xhr );
                    };
                    options.error = function ( resp ) {
                        // will returns local copy if error from say a timeout
                        debug.log ( 'read error', resp );
                        return error( localsync( method, model, options ) );
                    };
                    // returns local if there are results else returns remote
                    if ( returned && returned.length ) {
                        // fetch the remote data and populate cache in background
                        _success = function ( resp , status, xhr ) {
                            Backbone.connectid.stoppedSyncing('lazy success');
                            debug.log ('lazy callback refresh local after fetch', resp , status, xhr);
                        };
                        _doXHRs (  hooks, function () {  return onlineSync( method, model , options ); } );
                        // TODO: do we really need to call backbone success as well as calls sync again? localsync is now returning models
                        return success (returned);
                    } else {
                        // call success on xhr.success
                        _success = success;
                        return _doXHRs (  hooks,
                            function () {  return onlineSync( method, model , options ); },
                            function () {  return success( localsync( method, model, options ) ); }
                        );
                    }
                    break;
                case 'create':
                    if ( options.isSyncRequest ) {
                        // tidy up id before remote call on dirty records - see sync dirty, has to be done here so collection has a key in it should request fail
                        delete model.id;
                        model.unset( model.idAttribute );
                    // if a dirty model is updated during a sync it's original id will be missing. The workaround is to put back the id and save a dirty version
                    } else if ( Backbone.connectid.isSyncing() && model.jerryHallId) {
                        dirtyModel = model.clone();
                        dirtyModel.set(model.idAttribute || 'id' , model.jerryHallId.toString() );
                        delete dirtyModel.jerryHallId;
                        return success ( localsync ('update',dirtyModel,{ dirty: true , storeName : options.storeName, ignoreCallbacks: true } ) );
                    } else if ( dirtyModel ) {
                        $.when.apply( $, hooks ).then( function () {
                            Backbone.connectid.stoppedSyncing( 'Create Sync Resolved' );
                        } );
                        return success( returned );
                    } else {
                        options.success = function ( resp, status, xhr ) {
                            var updatedModel, collection;
                            updatedModel = modelUpdatedWithResponse( model, resp );
                            localsync( method, updatedModel, options );
                            return success( resp, status, xhr );
                        };
                        options.error = function ( resp, status, xhr ) {
                            // response code of 0 = network error, if gone offline then do it dirty
                            // remove dirty model if there was one
                            _cleanupDirtyModel( collection, model, resp, options );
                            if ( !resp || resp.status === 0 ) { // code 0 implies connectivity error
                                if ( !model.dirtySync ) {
                                    options.dirty = true;
                                    return success( localsync( method, model, options ) );
                                } else {
                                    delete model.dirtySync;
                                    return error( localsync( method, model, options ) );
                                }
                            } else if ( typeof error === 'function' ) {
                                debug.log( 'create error', resp );
                                // remove record from local collection to keep in sync
                                model.destroy( {  local : true, remote : false, dualSync : false, silent: true } );
                                collection.remove( model, { local : true, remote : false, dualSync : false, silent: true } );
                                delete model.dirtySync;
                                // have changed this as looks like the args were wrong
                                //                            return error( model, resp , options );
                                return  error( resp, xhr, options );
                            }
                        };
                        _doXHRs( hooks,
                            function () {
                                // post will return new id
                                model.unset( model.idAttribute || 'id' );
                                return onlineSync( method, model, options );
                            },
                            function ( resp ) {
                                return options.error( resp );
                            } );
                    }
                    break;
                case 'update':
                    // if it was a dirtyModel updated and we're syncing then nothing else to do so just returns
                    if ( dirtyModel ) {
                        $.when.apply( $, hooks ).then( function () {
                            Backbone.connectid.stoppedSyncing( 'Update Sync Resolved' );
                        } );
                        return success( returned );
                    // this condition is where the update is being done on a record currently being created
                    } else if ( isClientKey ( model.id ) ) {
                        // if its a local key then need to keep things in sync
                        model.originalModel = model.clone();
                        options.success = function ( resp, status, xhr ) {
                            var updatedModel;
                            updatedModel = modelUpdatedWithResponse( model, resp );
                            localsync( 'delete', model.originalModel, options );
                            localsync( 'create', updatedModel, options );
                            // the dirty version is deleted on sync success callback so we need to add the clean version here
                            // this could be annoying as it means add and remove instead of change event being fired
//                            if ( !collection.get ( updatedModel ) ) {
//                                collection.add( updatedModel, { silent : true } );
//                            }
                            return success( resp, status, xhr );
                        };
                        options.error = function ( resp , xhr, options) {
                            options = options || {};
                            // put the id back so can be manipulated
                            options.dirty = true;
                            model.set ( 'id' , model.id || model.jerryHallId );
                            if ( resp && resp.status) debug.log('update error',resp);
                            delete model.jerryHallId;
                            return error ( resp, xhr, options );
                        };
                        delete model.id;
                        model.unset( model.idAttribute );
                        return _doXHRs (  hooks,
                            function () {  return onlineSync( 'create', model , options ); },
                            function (resp) {  return options.error(resp); }
                        );
                    } else {
                        options.success = function ( resp, status, xhr ) {
                            var updatedModel;
                            updatedModel = modelUpdatedWithResponse( model, resp );
                            debug.log ('updated Model suc cb', updatedModel);
                            localsync( method, updatedModel, options );
                            return success( resp, status, xhr );
                        };
                        options.error = function ( resp ) {
                            options.dirty = true;
                            if ( resp && resp.status) debug.log('update error',resp);
//                            return success( localsync( method, model, options ) );
                            return error ( resp, xhr, options );
                        };
                        debug.log('update doXHRs', method, model, options);
                        return _doXHRs (  hooks,
                            function () {  debug.log('update onCB', method, model, options); return onlineSync( method, model , options ); },
                            function (resp) {  return options.error(resp); }
                        );
                    }
                    break;
                case 'delete':
                    // if deleted a local model then job done
                    if ( dirtyModel) {
                        return success (returned);
                    // else this is a delete of a local model but we are currently syncing
                    } else if ( isClientKey ( model.id ) ) {
                        return localsync( method, model, options );
                    } else {
                        options.success = function ( resp, status, xhr ) {
                            debug.log ('deleted Model suc cb', model.id, method, model, resp);
                            localsync( method, model, options );
                            return success( model, resp , options );
                        };
                        options.error = function ( resp ) {
                            if ( resp && resp.status) debug.log('delete error',resp);
                            options.dirty = true;
                            return success( localsync( method, model, options ) );
                        };
                        return _doXHRs (  hooks,
                            function () {  debug.log('delete onCB', method, model, options); return onlineSync( method, model , options ); },
                            function (resp) {  return options.error(resp); }
                        );
                    }
            }
        }
    };

    Backbone.sync = dualsync;

}).call( this );
