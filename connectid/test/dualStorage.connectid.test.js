/**
 * Tests of more advanced / edge case dualStorage cases for connectid in lazy dualSync mode.
 */

// dualSync = sync online / offline
// remote = fetch remote - remote only ( default behaviour, ignores local cache if dualSync is false
// local = fetch local - local only
// returnFirst =  default is remote if remote and online and no dirty data otherwise local
// isOnline = defaults to navigator.onLine but who the fuck capitalizes the L in online! Doesn't try to make requests, does same as if error 0

define( [ 'dualStorage' , 'jquery' , 'underscore' ] ,  function ( Backbone , $ , _ ) {
    // identifies a dualStorage generated key rather than a mongodb generated one
    function isClientKey ( id ) {
        return (!!id && id.length === 36 && id.match(/-/g).length === 4);
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
        before ( function () {
            TestModel  = Backbone.Model.extend({
                idAttribute: '_id'
            });
            TestCollection = Backbone.Collection.extend({
                local: true, // maintain local copy
                remote:  true,// maintain remote copy
                dualSync : true,// sync local and remote copies
                model : TestModel,
                returnFirst : 'local',
                isOnline : true,
                url : '/api/1/tests', // doesnt exist
                comparator: function( doc ) {
                    return doc.name;
                }
            });
        });
        describe('Clean locally synced collections', function() {
            var coll,
                _id = Math.pow( 10 , 32 );
            function _createDoc ( doc ) {
                // success CB is called when local only so make sure we dont CB twice
                var isLocal = false;
                // clearout the call stack so getCall 0 is last all
                $.ajax.reset();
                coll.create ( doc , { success: function () { isLocal = true; } } );
                // give it a "proper" id, ie no hyphens like you get from mongo
                if ( !isLocal) $.ajax.getCall(0).args[0].success( _.extend ( doc , {_id : _id++ } ) );
            }
            beforeEach ( function() {
                window.localStorage.clear();
                coll = new TestCollection();
                sinon.stub( $ , 'ajax');
                aList.forEach ( _createDoc );
                console.log ( 'coll JSON' , coll.toJSON() );
                coll.length.should.equal(3);
                $.ajax.reset();
            });
            afterEach ( function() {
                $.ajax.restore();
            });
            describe('when online' , function() {
                it('should return local version if returnFirst = local or not defined');
                it('should fetch & return remote version if returnFirst = remote' , function () {

                });
            });
            describe('when offline' , function() {
                it('should ignore returnFirst = remote');
                it('should get a blank collection');
                it('should add records locally');
            });
        });
        describe('Empty locally synced collections', function() {
            var coll;
            beforeEach ( function() {
                window.localStorage.clear();
                coll = new TestCollection();
            });
            afterEach ( function() {
                $.ajax.restore();
            });
            describe('when online' , function() {
                beforeEach ( function() {
                    window.localStorage.clear();
                    coll.isOnine = true;
                });
                it('should fetch and return remote even if returnFirst = local');
                it('should not make a localStorage copy if dualSync not enabled for collection (default Backbone Behaviour');
            });
            describe('when offline' , function() {
                beforeEach ( function() {
                    window.localStorage.clear();
                    coll.isOnine = fale;
                });

                it('should create and return a new blank local collection regardless of returnFirst');
                it('should not attempt to make remote calls if local or dualSync option set');
                it('should attempt to make remote calls if dualSync not enabled for collection (default Backbone)');
                it('should not make a localStorage copy if dualSync not enabled for collection (default Backbone)');
            });
        });
        describe('Dirty locally synced collections', function() {
            var coll;
            beforeEach ( function() {
                window.localStorage.clear();
                coll = new TestCollection();
                sinon.stub( $ , 'ajax');
                coll.create ( { name: 'Adam', date: new Date()});
            });
            afterEach ( function() {
                $.ajax.restore();
            });
            describe('when online' , function() {
                it('should sync dirty records next create online');
                it('should sync dirty records next read online');
                it('should sync dirty records next update online');
                it('should sync dirty records next delete online');
                it('should not create or update a remote record if delete queued');
                it('should return remote results from local cache on double fetch');
                it('should return dirty results on second fetch if queue not yet played back');
                it('should have fully refreshed collection after queue played back');
                it('should not lose records if connectivity fails');
                it('should put all other CRUD errors in error collection');
            });
            describe('when offline' , function() {
                it('should continue to create and return local records');
                it('should update records from collection fetched');
                it('should remove deleted records from collection fetched');
             });
        });
    });
});