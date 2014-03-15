/**
 * Tests of more advanced / edge case dualStorage cases for connectid in lazy dualSync mode.
 */

// dualSync = sync online / offline
// remote = fetch remote
// local = fetch local
// returnFirst =  default is remote if remote and online and no dirty data otherwise local
// isOnline = defaults to navigator.onLine but who the fuck capitalizes the L in online! Doesn't try to make requests, does same as if error 0

define( [ 'dualStorage' , 'jquery' ] ,  function ( Backbone , $ ) {
    // identifies a dualStorage generated key rather than a mongodb generaterd one
    function isClientKey ( id ) {
        return (!!id && id.length === 36 && id.match(/-/g).length === 4);
    }
    var expect = chai.expect,
        should = chai.should(),
        TestModel,
        TestCollection;
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
            var coll;
            beforeEach ( function() {
                window.localStorage.clear();
                coll = new TestCollection();
                sinon.stub( $ , 'ajax');
                coll.create ( { name: 'Adam', date: new Date() } );
            });
            afterEach ( function() {
                $.ajax.restore();
            });
            describe('when online' , function() {
                it('should fetch & return remote version if returnFirst = remote');
                it('should return local version if returnFirst = local or not defined');

            });
            describe('when offline' , function() {
                it('should ignore returnFirst = remote');
                it('should get a blank collection');
                it('should add records locally');
                it('should sync dirty records next create online');
                it('should sync dirty records next read online');
                it('should sync dirty records next update online');
                it('should sync dirty records next delete online');
            });
        });
        describe('Clean locally synced collections', function() {
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
            });
            describe('when offline' , function() {
                it('should create a new blank local collection');
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
            });
            describe('when offline' , function() {
            });
        });
    });
});