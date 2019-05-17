describe("Example test set", function() {
    it("should have written tests",function(){
        expect(true).toBe(true);
        expect(Ext.Date.format(new Date(),'Y')).toEqual('2019');
    });
    
    it('should render the app', function() {
        var app = Rally.test.Harness.launchApp("CArABU.app.TSApp");
        expect(app.getEl()).toBeDefined();
    });
    
});
