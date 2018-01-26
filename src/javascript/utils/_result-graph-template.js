//template
Ext.define('CArABU.technicalservices.ResultGraphTemplate',{
    extend: 'Ext.XTemplate',

    /**
     * @cfg {String}
     * define a width if necessary to fit where it's being used
     */
    width: '90%',
    /**
     * @cfg {String}
     * define a height if necessary to fit where it's being used
     */
    height: '20px',

    config: {

        calculateColorFn: function(stateIdx){
            return colors[stateIdx];
        },
        getContainerClass: function(recordData) {
            return '';
        },
        getClickableClass: function(){
            return '';
        },
        getDimensionStyle: function(){
            return 'width: ' + this.width + '; height: ' + this.height + '; line-height: ' + this.height + ';display: inline-block';
        },
        calculateWidth: function (values, color) {
            var total = Ext.Array.sum(Ext.Object.getValues(values));
            if (total > 0){
              var pct = (values[color] || 0)/total * 100;
              return pct + '%';
            }
            return 0;
        }
    },

    constructor: function(config) {
        var templateConfig = [
                '<tpl>',
                '<div class="progress-bar-container {[this.getClickableClass()]} {[this.getContainerClass(values)]}" style="{[this.getDimensionStyle()]}">',
                '<tpl foreach=".">',
                  '<div class="rly-progress-bar" style="text-align:center;background-color: {$}; width: {[this.calculateWidth(parent,xkey)]}; "></div>',
                '</tpl>',
                '</div>',
                '</tpl>'
            ];

        return this.callParent(templateConfig);
    }
});