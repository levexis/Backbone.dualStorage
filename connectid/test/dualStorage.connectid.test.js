/**
 * Tests of more advanced / edge case dualStorage cases for connectid in lazy dualSync mode.
 */

// dualSync = sync online / offline - do both online and offline, enables return etc
// remote = fetch remote - remote only ( default behaviour, ignores local cache if dualSync is false
// local = fetch local - local only if remote and dualSync disabled
// return =  default is remote if remote and online and no dirty data otherwise local
// isOnline = defaults to navigator.onLine but who the fuck capitalizes the L in online! Doesn't try to make requests, does same as if error 0

define( [ 'dualStorage' , 'jquery' , 'underscore' ] ,  function ( Backbone , $ , _ ) {
    // identifies a dualStorage generated key rather than a mongodb generated one
    function isClientKey ( id ) {
        return (!!id && id.length === 36 && id.match(/-/g).length === 4);
    }

    /**
     * checks doc._id for backbone id using isClientKey
     * @param {object} doc
     * @returns {boolean} true if a local record not yet synced
     */
    function isDirty ( doc ) {
        return isClientKey ( doc._id );
    }
    var expect = chai.expect,
        should = chai.should(),
        TestModel,
        TestCollection,
        aList = [ { name: 'Adam', date: new Date() },
            { name: 'Bertie', date: new Date() },
            { name: 'Chris', date: new Date() }
        ],
        dList = [ { name: 'Dan', date: new Date() },
            { name: 'Eric', date: new Date() },
            { name: 'Fred', date: new Date() }
        ],
        gList = [ { name: 'Geoff', date: new Date() },
            { name: 'Henry', date: new Date() },
            { name: 'Ian', date: new Date() }
        ];

    describe('test ConnectiD dualStorage', function() {
        var coll,
            _id = 1,//Math.pow( 10 , 32 ),
            remoteColl = _.union( aList, dList );
        /**
         * creates a new document for stubbed out collection
         * @param doc {object} doc to create, will add an _id if remote create set
         * @param callBack {function}
         * @private
         */
        function _createDoc ( doc , callBack ) {
            // success CB is called when local only so make sure we don't CB twice
            var isLocal = false;
            // clearout the call stack so getCall 0 is last all
            $.ajax.reset();
            coll.create ( doc , { success: function () {
                isLocal = true; // rename cbCalled perhaps
                if ( typeof callBack === 'function' ) callBack ( remoteCollection );
            } } );
            // actually useful to add the ids as we go to the object so we can easily fetch
            doc._id = _id++;
            if ( !isLocal) $.ajax.getCall(0).args[0].success( doc );
            // give it a "proper" id, ie no hyphens like you get from mongo
//            if ( !isLocal) $.ajax.getCall(0).args[0].success( _.extend ( doc , {_id : _id++ } ) );
        }
        /**
         * fetches stubbed collection, pass in remote collection.
         * @param remoteCollection {array}
         * @param callBack {function}
         * @private
         */
        function _fetch ( remoteCollection , callBack ) {
            // success CB is called when local only so make sure we don't CB twice
            var isLocal = false;
            // clearout the call stack so getCall 0 is last all
            $.ajax.reset();
            coll.fetch (  { success: function () {
                isLocal = true; // rename cbCalled perhaps
                if ( typeof callBack === 'function' ) callBack ( remoteCollection );
            } } );
            // give it a "proper" id, ie no hyphens like you get from mongo and prevent double callback
            if ( !isLocal) $.ajax.getCall(0).args[0].success( remoteCollection );
        }

        before ( function () {
            TestModel = Backbone.Model.extend({
                idAttribute: '_id',
                validate: function(attrs, options) {
                    if ( _.has(attrs,'name') ) {
                        var name = attrs.name.toLowerCase();
                        return ( !name ||
                            name === 'jon' ||
                            name === 'shaun' ||
                            name === 'ian'  );
                    }
                }
            });
            TestCollection = Backbone.Collection.extend({
                local: true, // maintain local copy
                remote:  true,// maintain remote copy
                dualSync : true,// sync local and remote copies
                model : TestModel,
                return : 'local',
                isOnline : true,
                url : '/api/1/tests', // doesnt exist
                comparator: function( doc ) {
                    return doc.name;
                }
            });
        });
        describe('Clean locally synced collections, remote changed', function() {
            beforeEach ( function() {
                window.localStorage.clear();
                coll = new TestCollection();
                sinon.stub( $ , 'ajax');
                aList.forEach ( _createDoc );
                coll.length.should.equal(3);
                $.ajax.reset();
            });
            afterEach ( function() {
                $.ajax.restore();
            });
            describe('when online' , function() {
                beforeEach ( function() {
                    coll.isOnline = true;
                });
                it('should return local version if return = local or not defined' , function () {
                    coll.return = 'local';
                    _fetch( remoteColl );
                    coll.length.should.equal(3);
                    delete coll.return;
                    _fetch( remoteColl );
                    coll.length.should.equal(3);
                });
                it('should fetch & return remote version if return = remote' , function ( done ) {
                    coll.return = 'remote';
                    _fetch( remoteColl , function () {
                        coll.length.should.equal(6);
                        done();
                    });
                });
                it('should return local if lost connectivity / remote timeout');
            });
            describe('when offline' , function() {
                beforeEach ( function() {
                    coll.isOnline = false;
                });
                it('should ignore return = remote', function () {
                    coll.return = 'remote';
                    _fetch( remoteColl );
                    coll.length.should.equal(3);
                });
                it('should add records locally' , function () {
                    _createDoc ( gList[0] );
                    $.ajax.should.not.have.been.called;
                    _fetch( remoteColl );
                    $.ajax.should.not.have.been.called;
                    coll.length.should.equal(4);
                    expect ( isDirty ( coll.toJSON.pop() ) ).to.be.true;
                });
                it('should support isOnline as a function' , function () {
                    coll.isOnline = function () { return false };
                    _fetch( remoteColl );
                    coll.length.should.equal(3);
                });
            });
        });
        describe('Empty locally synced collections', function() {
            var coll;
            beforeEach ( function() {
                window.localStorage.clear();
                coll = new TestCollection();
                sinon.stub( $ , 'ajax');
            });
            afterEach ( function() {
                $.ajax.restore();
            });
            describe('when online' , function() {
                beforeEach ( function() {
                    coll.isOnline = true;
                });
                it('should fetch and return remote even if return = local' , function ( done ) {
                    coll.return = 'local';
                    _fetch( remoteColl , function () {
                        $.ajax.should.have.been.calledOnce;
                        done();
                    });
                });
                it('should not make a localStorage copy if dualSync not enabled for collection (default Backbone Behaviour)', function () {
                    coll.dualSync = false;
                    coll.local = false;
                    _fetch( remoteColl , function () {
                        window.localStorage.length.should.equal( 0 );
                        $.ajax.should.have.been.called;
                        done();
                    });
                });
            });
            describe('when offline' , function() {
                beforeEach ( function() {
                    coll.isOnine = false;
                });
                it('should still not make a localStorage copy if dualSync not enabled for collection (default Backbone Behaviour)', function () {
                    coll.dualSync = false;
                    coll.local = false;
                    _fetch( remoteColl );
                    window.localStorage.length.should.equal( 0 );
                    $.ajax.should.have.been.called;
                });
                it('should create and return a new blank local collection regardless of return', function() {
                    coll.return = 'local';
                    _fetch( remoteColl );
                    coll.length.should.be( 0 );
                    window.localStorage.length.should.not.equal( 0 );
                });
                it('should not attempt to make remote calls if local or dualSync option set' , function () {
                    _fetch( remoteColl );
                    $.ajax.should.not.have.been.called;
                });
                it('should attempt to make remote calls if dualSync not enabled for collection (default Backbone)' , function () {
                    coll.dualSync = false;
                    _fetch( remoteColl );
                    $.ajax.should.have.been.called;
                });
                it('should validate on local create and reject if validation fails' , function () {
                    _createDoc({ name: 'Jon' });
                    coll.length.should.be( 0 );
                });
            });
        });
        describe('Dirty locally synced collections', function() {
            var coll;
            beforeEach ( function() {
                window.localStorage.clear();
                coll = new TestCollection();
                sinon.stub( $ , 'ajax');
                aList.forEach ( _createDoc );
                coll.length.should.equal(3);
                // now put offline
                coll.isOnline = false;
                dList.forEach ( _createDoc );
                coll.length.should.equal(6);
                $.ajax.reset();
            });
            afterEach ( function() {
                $.ajax.restore();
            });
            describe('when online' , function() {
                beforeEach ( function() {
                    coll.isOnline = true;
                });
                it('should sync dirty records before next create online' , function ( done ) {
                    _createDoc( gList[0] , function () {
                        $.ajax.should.have.callCount ( 4 );
                        coll.length.should.equal ( 7 );
                        done();
                    });
                    $.ajax.getCall(1).args[0].success();
                    $.ajax.getCall(2).args[0].success();
                    $.ajax.getCall(3).args[0].success();
                    $.ajax.getCall(4).args[0].success();
                });
                it('should sync dirty records after next read online');
                it('should sync dirty records before next update online' , function () {
                    var rec = coll.get ( 1 );
                    rec.set ( { updated : true } );
                    rec.save( { success: function () {
                            // may need to call success on last?
                            // $.ajax.getCall(3).args[0].success( );
                            coll.length.should.equal ( 6 );
                            done();
                        }
                    });
                    $.ajax.should.have.callCount ( 4 );
                });
                it('should sync dirty records before next delete online' , function () {
                    var rec = coll.get(1);
                    coll.remove ( rec );
                    $.ajax.should.have.callCount ( 4 );
                    coll.length.should.equal ( 5 );
                });
                it('should not create or update a remote record if delete queued', function () {
                    var rec = coll.findWhere ( { name : dList[0] } );
                    coll.remove ( rec );
                    $.ajax.should.have.callCount ( 2 );
                    coll.length.should.equal ( 5 );
                });
                it('should return remote results from local cache on double fetch' , function () {
                    var _dirtyCount = 0, result = [];
                    function checkDirty ( doc ) {
                        if ( isDirty( doc ) ) {
                            _dirtyCount ++;
                            return true;
                        } else {
                            return false;
                        }
                    }
                    _fetch( _.extend( aList , dList ) );
                    // return dirty
                    result = coll.toJSON();
                    result.forEach ( checkDirty );
                    expect( dirtyCount ).to.equal(3);
                    // return clean
                    _fetch( _.extend( aList , dList ) );
                    result = coll.toJSON();
                    result.forEach ( checkDirty );
                    expect( dirtyCount ).to.equal(3);
                    expect ( result ).to.deepEqual( _.extend(aList,dList) );
                });
                it('should return dirty results on second fetch if queue not yet played back');
                it('should have fully refreshed collection after queue played back');
                it('should not lose records if connectivity fails');
                it('should put all other CRUD errors in error collection');
            });
            describe('when offline' , function() {
                beforeEach ( function() {
                    coll.isOnline = false;
                });
                it('should continue to create and return local records' , function () {
                    _createDoc( gList[0] );
                    _fetch();
                    coll.length.should.equal( 7 );
                    $.ajax.should.not.have.been.called;
                });
                it('should update records from collection fetched' , function () {
                    var doc = coll.get ( 1 );
                    doc.set( { updated : true } );
                    doc.save();
                    $.ajax.should.not.have.been.called;
                    coll.toJSON()[0].updated.should.equal( true );
                });
                it('should remove deleted records from collection fetched', function() {
                    var doc = coll.get ( 1 );
                    coll.remove ( doc );
                    $.ajax.should.not.have.been.called;
                    coll.length.should.be( 5 );
                });
             });
        });
        describe('helper method unit level', function() {
            it('should support direct call to syncDirtyAndDestroyed');
            it('should sync records in order they were created');
            it('should wait for one action to complete before starting another');
            it('should execute sync asynchronously so app can continue to be used wokrking with offline data');
            it('should wait for syncing to complete before executing next remote fetch');
        });
    });
});