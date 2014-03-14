/**
 * Created by paulcook on 13/03/2014.
 */

define( [ 'dualStorage' , 'jquery' ] ,  function ( Backbone , $ ) {
    var expect = chai.expect,
        should = chai.should(),
        TestModel,
        TestCollection;
    describe('test Backbone dualStorage', function() {
        before ( function () {
            TestModel  = Backbone.Model.extend({
                idAttribute: '_id'
            });
        });
        it('should be an object', function () {
            expect( Backbone ).to.be.an('object');
            expect( $ ).to.be.a('function');
        });
        it('should extend a model ', function () {
            expect( new TestModel() ).to.be.instanceOf(Backbone.Model );
        });
        describe('create collection', function() {
            beforeEach ( function() {
                TestCollection = Backbone.Collection.extend({
                    local: true,
                    remote:  true,
                    dualSync : true,
                    model : TestModel,
                    url : '/api/1/tests',
                    comparator: function( doc ) {
                        return doc.name;
                    }
                });
                expect( new TestCollection() ).to.be.instanceOf( Backbone.Collection );
                window.localStorage.clear();
            })
            it('new remote collection ', function ( done ) {
                var returnVal = {};
                sinon.stub( $ , 'ajax');//.yields (); // put / delete
                var coll = new TestCollection();
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
                $.ajax.getCall(0).args[0].success(returnVal);
                $.ajax.restore();
                coll.toJSON()[0]._id.should.equal(1);
                done();
            });
            it('new local collection ', function ( done ) {
                var returnVal = {};
                sinon.stub( $ , 'ajax');//.yields (); // put / delete
                var coll = new TestCollection();
                coll.remote = false;
                coll.dualSync = false;
                returnVal =  { name: 'Adam', date: new Date() };
                coll.create ( new TestModel ( returnVal ) , { success: function( model , response ) {
//                    console.log( 'success CB2' , model, response);
                    }
                });
                $.ajax.should.not.have.been.called;
                $.ajax.restore();
                // local key has 4 hyphons
                (coll.toJSON()[0]._id).match(/-/g).length.should.equal(4);
                done();
            });
            it('new dual collection ', function ( done ) {
                var returnVal = {};
                sinon.stub( $ , 'ajax');//.yields (); // put / delete
                var coll = new TestCollection();
                returnVal =  { name: 'Adam', date: new Date() };
                coll.create ( new TestModel ( returnVal ) , { success: function( model , response ) {
//                    console.log( 'success CB3' , model, response);
                }
                });
                returnVal._id = 3;
                $.ajax.getCall(0).args[0].success(returnVal);
                $.ajax.restore();
                coll.toJSON()[0]._id.should.equal(3);
                done();
            });
        })
    });
});