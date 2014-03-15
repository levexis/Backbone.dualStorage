/**
 * Tests basic dualStorage behaviours
 */
// dualSync = sync online / offline ( use lazySync?)
// remote = fetch remote
// local = fetch local
// returnFirst =  default is remote if remote and online and no dirty data otherwise local ( or could call Lazy )
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
    describe('test Backbone dualStorage object', function() {
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
        it('should be an object', function () {
            expect( Backbone ).to.be.an('object');
            expect( $ ).to.be.a('function');
        });
        it('should extend a model ', function () {
            expect( new TestModel() ).to.be.instanceOf(Backbone.Model );
            expect( new TestCollection() ).to.be.instanceOf( Backbone.Collection );
        });
        describe('create new collection', function() {
            var coll;
            beforeEach ( function(done) {
                window.localStorage.clear();
                coll = new TestCollection();
                sinon.stub( $ , 'ajax');
                done();
            });
            afterEach ( function() {
                $.ajax.restore();
            });
            it('new remote collection ', function ( done ) {
                var returnVal = {};
                coll.local = false;
                coll.dualSync = false;
                returnVal =  { name: 'Adam', date: new Date() };
                coll.create ( new TestModel ( returnVal ) , { success: function( model , response ) {
//                        console.log( 'success CB'  , model, response);
                    }
                });
                $.ajax.should.have.been.calledOnce;
                expect ( $.ajax.getCall(0).args[0].type).to.be.equal( 'POST' );
                expect ( $.ajax.getCall(0).args[0].url).to.be.equal( '/api/1/tests');
                // now call callback
                returnVal._id = 1;
                $.ajax.getCall(0).args[0].success( returnVal ); // mock API response with returnVal
                coll.toJSON()[0]._id.should.equal(1);
                done();
            });
            it('new local collection ', function ( done ) {
                var returnVal = {};
                coll.remote = false;
                coll.dualSync = false;
                returnVal =  { name: 'Adam', date: new Date() };
                coll.create ( new TestModel ( returnVal ) , { success: function( model , response ) {
//                    console.log( 'success CB2' , model, response);
                    }
                });
                $.ajax.should.not.have.been.called;
                // local keys will be in backbone format which is a string containing four hyphens
                expect (isClientKey( coll.toJSON()[0]._id) ).to.be.ok;                ;
                done();
            });
            it('new dual collection ', function ( done ) {
                var coll = new TestCollection();
                returnVal =  { name: 'Adam', date: new Date() };
                coll.create ( new TestModel ( returnVal ) ); // no need to specify success cb
                returnVal._id = 3;
                $.ajax.getCall(0).args[0].success( returnVal );
                coll.toJSON()[0]._id.should.equal(3);
                done();
            });
            it('should reject invalid models on create');
        });
        // as this is done
        describe('local only collections', function() {
            var coll;
            beforeEach ( function() {
                window.localStorage.clear();
                coll = new TestCollection();
                coll.dualSync = false;
                coll.remote = false;
                sinon.stub( $ , 'ajax');
            });
            afterEach ( function() {
                $.ajax.restore();
            });
            it('should never fetch remote', function() {
                var success = false;
                coll.fetch( { success: function() {
                    success = true;
                } });
                success.should.be.ok;
                coll.length.should.equal( 0 );
                $.ajax.should.not.have.been.called;
            });
            it('should ignore online', function() {
                coll.online = true;
                var success = false;
                coll.fetch( { success: function() {
                    success = true;
                } });
                success.should.be.ok;
                coll.length.should.equal( 0 );
                $.ajax.should.not.have.been.called;
            });
            it('should ignore returnFirst', function() {
                coll.returnFirst = 'remote';
                var success = false;
                coll.fetch( { success: function() {
                    success = true;
                } });
                success.should.be.ok;
                coll.length.should.equal( 0 );
                $.ajax.should.not.have.been.called;
            });
            it('should reject invalid models on create');
        });
        describe('remote only collections', function() {
            var coll;
            beforeEach ( function() {
                window.localStorage.clear();
                coll = new TestCollection();
                coll.dualSync = false;
                coll.remote = true;
                sinon.stub( $ , 'ajax');
            });
            afterEach ( function() {
                $.ajax.restore();
            });
            it('should never fetch remote', function() {
                var success = false;
                coll.fetch( { success: function() {
                    success = true;
                } });
                success.should.not.be.ok;
                coll.length.should.equal( 0 );
                $.ajax.should.have.been.calledOnce;
            });
            it('should ignore online', function() {
                coll.online = true;
                var success = false;
                coll.fetch( { success: function() {
                    success = true;
                } });
                success.should.not.be.ok;
                coll.length.should.equal( 0 );
                $.ajax.should.have.been.called;
            });
            it('should ignore returnFirst', function() {
                coll.returnFirst = 'remote';
                var success = false;
                coll.fetch( { success: function() {
                    success = true;
                } });
                success.should.not.be.ok;
                coll.length.should.equal( 0 );
                $.ajax.should.have.been.called;
            });
            it('should reject invalid models on create');
        });
    });
});