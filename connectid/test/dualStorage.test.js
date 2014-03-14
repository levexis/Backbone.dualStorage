/**
 * Created by paulcook on 13/03/2014.
 */

define( [ 'backbone' ] ,  function ( Backbone  ) {
    var expect = chai.expect;
    describe('test backbone dualStorage', function() {
        it('should have a backbone object', function () {
            expect( Backbone ).to.be.an('object');
        });
    });
});