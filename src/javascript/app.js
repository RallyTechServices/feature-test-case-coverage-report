Ext.define("CArABU.app.TSApp", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new CArABU.technicalservices.Logger(),
    defaults: { margin: 10 },
    layout: 'border',

    // items: [
    //     {xtype:'container',itemId:'selector_box', layout:{type:'hbox',align: 'right'}, margin: '10 10 50 10'},
    //     {xtype:'container',itemId:'top_box',layout:{type:'hbox'},
    //     items: [{xtype:'container',itemId:'totals_f_box',layout:{type:'hbox'}, margin: '10 10 50 10'},
    //             {xtype:'container',itemId:'totals_box',layout:{type:'hbox'}, margin: '10 10 50 10'}]
    //         },
    //     {xtype:'container',itemId:'display_box', margin: '100 10 10 10' }
    // ],
    items: [
        {xtype:'container',itemId:'top_box',layout:{type:'hbox'},items: [{xtype:'container',itemId:'selector_box',layout:{type:'hbox'}, margin: '10 10 50 10'},
        {xtype:'container',itemId:'totals_box', layout:{type:'hbox',align: 'right'}, margin: '10 10 50 10'}]},
        {xtype:'container',itemId:'display_box', margin: '100 10 10 10' }
    ],
    integrationHeaders : {
        name : "CArABU.app.TSApp"
    },

    modelNames : ['PortfolioItem/Feature'],
    launch: function() {
        var me = this;
        //this.setLoading("Loading stuff...");

        this.logger.setSaveForLater(this.getSetting('saveLog'));

        me._addSelector();
    },

    _addSelector: function(){
        var me = this;
       
        me.down('#selector_box').add([
            {
                xtype: 'rallyreleasecombobox',
                name: 'releaseCombo',
                itemId: 'releaseCombo',
                stateful: true,
                stateId: me.getContext().getScopedStateId('releaseCombo'),   
                fieldLabel: 'Select Release:',
                multiSelect: true,
                margin: '10 10 10 10', 
                width: 450,
                labelWidth: 100,
                cls: 'rally-checkbox-combobox',
                valueField:'Name',
                displayField: 'Name'
                ,
                listConfig: {
                    cls: 'rally-checkbox-boundlist',
                    itemTpl: Ext.create('Ext.XTemplate',
                        '<div class="rally-checkbox-image"></div>',
                        '{[this.getDisplay(values)]}</div>',
                        {
                            getDisplay: function(values){
                                return values.Name;
                            }
                        }
                    )
                }
            },
            {
                xtype:'rallybutton',
                name: 'updateButton',
                itemId: 'updateButton',
                margin: '10 10 10 10',
                text: 'Update',
                listeners: {
                    click: me.updateView,
                    scope: me
                }
            }
        ]);
    },

    updateView: function(){
        var me = this;


        if(!me.down('#releaseCombo')) return;
        console.log('releases >',me.down('#releaseCombo').value);
        var pi_object_ids = [];


        me.setLoading(true);
        me._getSelectedPIs(me.modelNames[0]).then({
            success: function(records){
                // console.log('_getSelectedPIs>>',records);
                if(records.length == 0){
                    me.showErrorNotification('No Data found!');
                }
                Ext.Array.each(records,function(r){
                    pi_object_ids.push(r.get('ObjectID'));
                });


                Deft.Promise.all([me._getTCFromSnapShotStore(pi_object_ids),me._getUSFromSnapShotStore(pi_object_ids)]).then({
                    success: function(results){
                        console.log('results',results);

                        me.lb_tc_results = results[0];
                        var tc_filter = [];
                        me.lb_us_results = results[1];
                        var us_filter = [];                        
                        Ext.Array.each(results[0], function(tc){
                            tc_filter.push(tc.get('_ItemHierarchy')[tc.get('_ItemHierarchy').length - 2]);
                        });

                        // Ext.Array.each(results[1], function(us){
                        //     us_filter.push(tc.get('_ItemHierarchy')[tc.get('_ItemHierarchy').length - 1]);
                        // });

                        me._getTCs(tc_filter).then({
                            success: function(records){
                                console.log('_getTCs>>',records);
                                // me.totalTaskTimeSpent = 0;
                                me.lastVerdict = {}
                                Ext.Array.each(records,function(tc){
                                    me.lastVerdict[tc.get('ObjectID')] = tc.get('LastVerdict');
                                });

                                Ext.create('Rally.data.wsapi.TreeStoreBuilder').build({
                                    models: me.modelNames,
                                    enableHierarchy: true
                                }).then({
                                    success: me._addGrid,
                                    scope: me
                                });

                            },
                            scope: me
                        });

                    },
                    scope: me
                });

            },
            scope: me         
        }).always(function(){
            me.setLoading(false);
        });


    },

    _getSelectedPIs: function(selectedPI,filters){
        var me = this;
        var config = {
                        model : selectedPI,
                        fetch : ['ObjectID','FormattedID'],
                        limit:'Infinity'
                    }
        if(filters){
            config['filters'] = filters;
        }
        return me._loadWsapiRecords(config);
    },

    _getTCs: function(filters){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;

        Ext.create('CArABU.technicalservices.chunk.Store',{
            storeConfig: {
                model: 'TestCase',
                fetch: ['ObjectID','LastVerdict'],
            },
            chunkProperty: 'WorkProduct.ObjectID',
            chunkValue: filters
        }).load().then({
            success: function(records){
                deferred.resolve(records);
            },
            failure: me.showErrorNotification,
            scope: me
        });

        return deferred.promise;
    }, 

    _getUserStories: function(filters){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;

        Ext.create('CArABU.technicalservices.chunk.Store',{
            storeConfig: {
                model: 'HierarchicalRequirement',
                fetch: ['ObjectID'],
            },
            chunkProperty: 'ObjectID',
            chunkValue: filters
        }).load().then({
            success: function(records){
                deferred.resolve(records);
            },
            failure: me.showErrorNotification,
            scope: me
        });

        return deferred.promise;
    }, 

    _getTCFromSnapShotStore:function(piObjectIDs){
        var me = this;
        var deferred = Ext.create('Deft.Deferred');

        var find = {
                        "_TypeHierarchy": "TestCase",
                        "_ItemHierarchy": { $in: piObjectIDs }
                    };
        find["__At"] = "current";

        var snapshotStore = Ext.create('Rally.data.lookback.SnapshotStore', {
            "fetch": [ "ObjectID","LastVerdict","_ItemHierarchy"],
            "find": find,
            "useHttpPost": true
            ,
            "removeUnauthorizedSnapshots":true
        });

        snapshotStore.load({
            callback: function(records, operation) {
                console.log('operation>>',operation);
                if(operation.wasSuccessful()){
                    //deferred.resolve([piObjectIDs,records]);
                    deferred.resolve(records);
                }else{
                    if(operation.error.status === 403) {
                        me.showErrorNotification('You do not have required permissions to access the data.');
                    }else{
                        me.showErrorNotification('Problem Loading');
                    }
                    me.setLoading(false);
                }
                
            },
            scope:me
        });
    
        return deferred;
    },


    _getUSFromSnapShotStore:function(piObjectIDs){
        var me = this;
        var deferred = Ext.create('Deft.Deferred');

        var find = {
                        "_TypeHierarchy": "HierarchicalRequirement",
                        "_ItemHierarchy": { $in: piObjectIDs }
                    };
        find["__At"] = "current";

        var snapshotStore = Ext.create('Rally.data.lookback.SnapshotStore', {
            "fetch": [ "ObjectID","_ItemHierarchy","FormattedID","TestCases"],
            "find": find,
            "useHttpPost": true
            ,
            "removeUnauthorizedSnapshots":true
        });

        snapshotStore.load({
            callback: function(records, operation) {
                console.log('operation>>',operation);
                if(operation.wasSuccessful()){
                    //deferred.resolve([piObjectIDs,records]);
                    deferred.resolve(records);
                }else{
                    if(operation.error.status === 403) {
                        me.showErrorNotification('You do not have required permissions to access the data.');
                    }else{
                        me.showErrorNotification('Problem Loading');
                    }
                    me.setLoading(false);
                }
                
            },
            scope:me
        });
    
        return deferred;
    },

    _addGrid: function (store) {

        var me = this;
        var context = me.getContext();
        store.on('load', me._updateAssociatedData, me);
        var r_filters = [];
        Ext.Array.each(me.down('#releaseCombo').value, function(rel){
            r_filters.push({
                property: 'Release.Name',
                value: rel
            })
        });

        r_filters = Rally.data.wsapi.Filter.or(r_filters)

        console.log('Filter>>', r_filters && r_filters.toString());
        me.down('#display_box').removeAll();
        console.log("heights and widhths",this.getHeight(),this.getWidth(),me.getHeight(),me.getWidth(),me.down('#display_box').getHeight(),me.down('#display_box').getWidth());
        var height = me.down('#display_box').getHeight(),
            width = me.down('#display_box').getWidth();
        me.down('#display_box').add({
                  itemId: 'pigridboard',
                  xtype: 'rallygridboard',
                  context: context,
                  modelNames: me.modelNames,
                  toggleState: 'grid',
                  // stateful: true,
                  // stateId: context.getScopedStateId('gridboard_state1'),      
                  plugins: me._getPlugins(),
                  gridConfig: {
                    store: store,
                    enableEditing: false,
                    storeConfig:{
                        filters: r_filters
                    },
                    stateful: true,
                    stateId: context.getScopedStateId('gridboard_state'),                                         
                    columnCfgs: me._getColumnCfgs(),
                    derivedColumns: me.getDerivedColumns(),
                    shouldShowRowActionsColumn:false,
                    enableRanking: false,
                    enableBulkEdit: false,
                    sortableColumns: true,
                    folderSort:true,
                    // ,
                    // listeners:{
                    //     sortchange: function(ct, column, direction, eOpts){
                    //         console.log(ct, column, direction, eOpts);
                    //             this.sorters = {
                    //                 property: column.dataIndex,
                    //                 direction: direction,
                    //                 sorterFn  : function(v1, v2){
                    //                     console.log("v1,v2>>",v1,v2)
                    //                      v1 = v1.get('Release')['Name'] || '' ;
                    //                      v2 = v2.get('Release')['Name'] || '' ;
                    //                     return v1 > v2 ? 1 : v1 < v2 ? -1 : 0;
                    //                 }                                    
                    //             }                            
                    //     }
                    // }
                  },
                    listeners: {
                        load: me._addTotals,
                        scope: me
                    },                  
                  height: height,
                  width: width
              });

        me.setLoading(false);
    },


   _addTotals:function(grid) {
        var me = this;
        // var filters = me.down('#pigridboard') && me.down('#pigridboard').gridConfig.store.filters.items[0];
        var filters = grid && grid.gridConfig.store.filters.items[0];
        var allPi;
        me.setLoading('Loading totals...');
            me._getSelectedPIs(me.modelNames[0],filters).then({
                success: function(records){


                    var totalPass = 0;
                    var totalFail = 0;
                    var totalNoRun = 0;
                    var totalOther = 0;
                    var grandTotal = 0;
                    var feature_totals = {};
                    Ext.Array.each(records,function(r){
                        Ext.Array.each(me.lb_tc_results,function(lbTc){
                            if(Ext.Array.contains(lbTc.get('_ItemHierarchy'),r.get('ObjectID'))){
                                grandTotal++;
                                if(feature_totals[r.get('FormattedID')]){
                                    feature_totals[r.get('FormattedID')].grandTotal++
                                }else{
                                    feature_totals[r.get('FormattedID')] = {
                                        grandTotal:1,
                                        totalPass:0,
                                        totalFail:0,
                                        totalNoRun:0,
                                        totalOther:0                                       
                                    }
                                }                               
                                if(me.lastVerdict[lbTc.get('ObjectID')] == "Pass"){
                                    totalPass++;
                                    feature_totals[r.get('FormattedID')].totalPass++
                                }else if(me.lastVerdict[lbTc.get('ObjectID')] == "Fail"){
                                    totalFail++;
                                    feature_totals[r.get('FormattedID')].totalFail++
                                }else if(me.lastVerdict[lbTc.get('ObjectID')] == null || me.lastVerdict[lbTc.get('ObjectID')] == ""){
                                    totalNoRun++;
                                    feature_totals[r.get('FormattedID')].totalNoRun++
                                }else{
                                    totalOther++;
                                    feature_totals[r.get('FormattedID')].totalOther++
                                }
                            }
                        });
                    });
                    console.log('feature_totals>>',feature_totals);

                    var featurePassing = 0;
                    var featureFailing = 0;
                    var featureNoRun = 0;
                    var featureNotCovered =0;

                    _.each(feature_totals, function(value, key){
                        console.log('Key, Value', key,value);
                        if(value.grandTotal === value.totalPass) featurePassing++;
                        if(value.totalFail > 0) featureFailing++;
                        if(value.totalFail === 0 && value.totalPass === 0 && value.totalNoRun > 0) featureNoRun++;
                        if(value.totalFail === 0 && value.totalPass === 0 && value.totalNoRun === 0 && value.totalOther) featureNotCovered++;
                    });

                    me.down('#totals_box').removeAll();

                    // Ext.create('Ext.data.Store', {
                    //     storeId:'totalStore',
                    //     fields:['GrandTotal', 'TotalPass','TotalFail','TotalNoRun', 'TotalOther'],
                    //     data:{'items':[
                    //         { 'GrandTotal': grandTotal, 'TotalPass': totalPass, 'TotalFail': totalFail, 'TotalNoRun': totalNoRun, 'TotalOther': totalOther},
                    //     ]},
                    //     proxy: {
                    //         type: 'memory',
                    //         reader: {
                    //             type: 'json',
                    //             root: 'items'
                    //         }
                    //     }
                    // });

                    // me.down('#totals_box').add({
                    //     xtype: 'grid',
                    //     title: 'Test Case Coverage',
                    //     header:{
                    //         style: {
                    //             background: 'lightBlue',
                    //             'color': 'white',
                    //             'font-weight': 'bold'
                    //         }
                    //     },
                    //     store: Ext.data.StoreManager.lookup('totalStore'),
                    //     columns: [
                    //         { text: 'Total',  dataIndex: 'GrandTotal',flex:1},
                    //         { text: 'Pass', dataIndex: 'TotalPass'},
                    //         { text: 'Fail', dataIndex: 'TotalFail'},
                    //         { text: 'No Run', dataIndex: 'TotalNoRun'},
                    //         { text: 'Other', dataIndex: 'TotalOther'}
                    //     ],
                    //     width:600
                    // });


                    Ext.create('Ext.data.Store', {
                        storeId:'totalFeatureStore',
                        fields:['GrandTotal', 'FeaturePassing','FeatureFailing','FeatureNoRun', 'FeatureNotCovered'],
                        data:{'items':[
                            { 'GrandTotal': records.length, 'FeaturePassing': featurePassing, 'FeatureFailing': featureFailing, 'FeatureNoRun': featureNoRun, 'FeatureNotCovered': featureNotCovered},
                        ]},
                        proxy: {
                            type: 'memory',
                            reader: {
                                type: 'json',
                                root: 'items'
                            }
                        }
                    });

                    me.down('#totals_box').add({
                        xtype: 'grid',
                        title: 'Feature Coverage',
                        header:{
                            style: {
                                background: 'lightBlue',
                                'color': 'white',
                                'font-weight': 'bold'
                            }
                        },
                        store: Ext.data.StoreManager.lookup('totalFeatureStore'),
                        columns: [
                            { text: 'Total',  dataIndex: 'GrandTotal',flex:1},
                            { text: 'Passing', dataIndex: 'FeaturePassing'},
                            { text: 'Failing', dataIndex: 'FeatureFailing'},
                            { text: 'No Result', dataIndex: 'FeatureNoRun'},
                            { text: 'Not Covered', dataIndex: 'FeatureNotCovered'}
                        ],
                        width:600
                    });

                    me.setLoading(false);
                },
                scope:me
            });

 
    },

    _updateAssociatedData: function(store, node, records, success){
        var me = this;
        me.suspendLayouts();
        Ext.Array.each(records,function(r){

            var totalPass = 0;
            var totalFail = 0;
            var totalNoRun = 0;
            var totalOther = 0;

            var totalStories = 0;
            var totalCovered = 0;


            Ext.Array.each(me.lb_tc_results,function(lbTc){
                if(Ext.Array.contains(lbTc.get('_ItemHierarchy'),r.get('ObjectID'))){
                    if(me.lastVerdict[lbTc.get('ObjectID')] == "Pass"){
                        totalPass++;
                    }else if(me.lastVerdict[lbTc.get('ObjectID')] == "Fail"){
                        totalFail++
                    }else if(me.lastVerdict[lbTc.get('ObjectID')] == null || me.lastVerdict[lbTc.get('ObjectID')] == ""){
                        totalNoRun++
                    }else{
                        totalOther++
                    }
                }
            });

            Ext.Array.each(me.lb_us_results,function(lbUs){
                if(Ext.Array.contains(lbUs.get('_ItemHierarchy'),r.get('ObjectID'))){
                    totalStories++;
                    if(lbUs.get('TestCases') && lbUs.get('TestCases').length > 0) totalCovered++;
                }
            });            

            r.set('Passing', totalPass);
            r.set('Failing', totalFail);
            r.set('NoRun', totalNoRun);
            r.set('Other', totalOther);
            r.set('TotalStories', totalStories);
            r.set('TotalCovered', totalCovered);


        });
        me.resumeLayouts();
    },

    _getPlugins: function(){
        var me = this;

        var plugins = [
        {
                ptype: 'rallygridboardinlinefiltercontrol',
                inlineFilterButtonConfig: {
                    stateful: true,
                    stateId: me.getContext().getScopedStateId('filters'),
                    modelNames: me.modelNames,
                    inlineFilterPanelConfig: {
                        collapsed: false,
                        quickFilterPanelConfig: {
                            defaultFields: ['ArtifactSearch', 'Owner'],
                            addQuickFilterConfig: {
                                whiteListFields: ['Milestones', 'Tags']
                            }
                        },
                        advancedFilterPanelConfig: {
                            advancedFilterRowsConfig: {
                                propertyFieldConfig: {
                                    whiteListFields: ['Milestones', 'Tags']
                                }
                            }
                        }  
                    }                  
                },
                
        }
        ];

        plugins.push({
            ptype: 'rallygridboardfieldpicker',
            headerPosition: 'left',
            modelNames: me.modelNames,
            stateful: true,
            gridAlwaysSelectedValues: ['Name'],
            stateId: me.getContext().getScopedStateId('field-picker')
        });

        // plugins.push({
        //     ptype: 'rallygridboardsharedviewcontrol',
        //     sharedViewConfig: {
        //         stateful: true,
        //         stateId: me.getContext().getScopedStateId('feature-test-case-shared-view'),
        //         defaultViews: _.map(this._getDefaultViews(), function(view) {
        //             Ext.apply(view, {
        //                 Value: Ext.JSON.encode(view.Value, true)
        //             });
        //             return view;
        //         }, this),
        //         enableUrlSharing: this.isFullPageApp !== false
        //     }
        // });

        return plugins;        
    },

    // _getDefaultViews: function() {
    //     return [
    //         {
    //             Name: 'Default View',
    //             identifier: 1,
    //             Value: {
    //                 toggleState: 'grid',
    //                 fields: this._getColumnCfgs()
    //             }
    //         }
    //     ];
    // },

    _getColumnCfgs: function(){
        var me = this;

        return  [{
            dataIndex: 'Name',
            text: 'Name'
        }
        // ,
        // {
        //     dataIndex:'Release',
        //     text:'Release',
        //     doSort    : function(direction) {
        //                             me._sortStore({
        //                                 store       : this.up('rallygrid').getStore(),
        //                                 direction   : direction,
        //                                 columnName  : 'Release',
        //                                 subProperty : 'Name'
        //                             });
        //                         },

        // }
        ].concat(me.getDerivedColumns());
    },

    // _sortStore: function(config) {
    //     console.log('Here here');
    //     config.store.sort({
    //         property  : config.columnName,
    //         direction : config.direction,
    //         sorterFn  : function(v1, v2){
    //             v1 = (config.subProperty) ? v1.get(config.columnName) && v1.get(config.columnName)[config.subProperty] || '' : v1.get(config.columnName) || '';
    //             v2 = (config.subProperty) ? v2.get(config.columnName) && v2.get(config.columnName)[config.subProperty] || '' : v2.get(config.columnName) || '';
    //             return v1 > v2 ? 1 : v1 < v2 ? -1 : 0;
    //         }
    //     });
    // },

    getDerivedColumns: function(){
        return [{
            tpl: '<div style="text-align:center;"></div>',
            text: 'Result Graph',
            xtype: 'templatecolumn',
            renderer: function(value, metaData, record){
                var values = {'lightgreen':record.get('Passing'),'red':record.get('Failing'),'yellow':record.get('NoRun'),'blue':record.get('Other')}

                if (values && Ext.isObject(values)){
                    var tpl = Ext.create('CArABU.technicalservices.ResultGraphTemplate');
                    return tpl.apply(values);
                }

                return '';
            }
        },{
            tpl: '<div style="text-align:center;">{Passing}</div>',
            text: 'Passing',
            xtype: 'templatecolumn'
        },{
            tpl: '<div style="text-align:center;">{Failing}</div>',
            text: 'Failing',
            xtype: 'templatecolumn'
        },{
            tpl: '<div style="text-align:center;">{NoRun}</div>',
            text: 'No Run',
            xtype: 'templatecolumn'
        },{
            tpl: '<div style="text-align:center;">{Other}</div>',
            text: 'Other',
            xtype: 'templatecolumn'
        },{
            tpl: '<div style="text-align:center;"></div>',
            text: 'User Story Coverage',
            xtype: 'templatecolumn',
            renderer: function(value, metaData, record){
                var values = {'lightgreen':record.get('TotalCovered'),'lightgrey': (record.get('TotalStories') - record.get('TotalCovered'))}

                if (values && Ext.isObject(values)){
                    var tpl = Ext.create('CArABU.technicalservices.ResultGraphTemplate');
                    return tpl.apply(values);
                }

                return '';
            }
        },{
            tpl: '<div style="text-align:center;">{TotalCovered}</div>',
            text: 'User Stories Covered',
            xtype: 'templatecolumn'
        },{
            tpl: '<div style="text-align:center;">{TotalStories}</div>',
            text: 'Total User Stories',
            xtype: 'templatecolumn'
        }
        // ,{
        //     tpl: '<div style="text-align:center;"></div>',
        //     text: '',
        //     xtype: 'templatecolumn'
        // }
        ];
    },    
 
    _loadWsapiRecords: function(config){
        console.log('_loadWsapiRecords',config);
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        var default_config = {
            model: 'Defect',
            fetch: ['ObjectID']
        };
        // this.logger.log("Starting load:",config.model);
        Ext.create('Rally.data.wsapi.Store', Ext.Object.merge(default_config,config)).load({
            callback : function(records, operation, successful) {
                if (successful){
                    deferred.resolve(records);
                } else {
                    me.logger.log("Failed: ", operation);
                    deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                }
            }
        });
        return deferred.promise;
    },

    getSettingsFields: function() {
        var check_box_margins = '5 0 5 0';
        return [{
            name: 'saveLog',
            xtype: 'rallycheckboxfield',
            boxLabelAlign: 'after',
            fieldLabel: '',
            margin: check_box_margins,
            boxLabel: 'Save Logging<br/><span style="color:#999999;"><i>Save last 100 lines of log for debugging.</i></span>'

        }];
    },

    getOptions: function() {
        var options = [
            {
                text: 'About...',
                handler: this._launchInfo,
                scope: this
            }
        ];

        return options;
    },

    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }

        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{
            showLog: this.getSetting('saveLog'),
            logger: this.logger
        });
    },

    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    },

    showErrorNotification: function(msg){
        this.logger.log('showErrorNotification', msg);
        Rally.ui.notify.Notifier.showError({
            message: msg
        });
    },    



});
