Ext.define("CArABU.app.TSApp", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new CArABU.technicalservices.Logger(),
    defaults: { margin: 10 },
    layout: 'border',

    items: [
        {xtype:'container',itemId:'selector_box',layout:{type:'hbox'}, margin: '10 10 50 10' },
        {xtype:'container',itemId:'display_box', margin: '50 10 10 10' }
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
                displayField: 'Name',
                listeners: {
                    change: me.updateView,
                    scope: me
                }
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
        });


    },

    _getSelectedPIs: function(selectedPI,filters){
        var me = this;
        var config = {
                        model : selectedPI,
                        fetch : ['ObjectID','AcceptedLeafStoryPlanEstimateTotal','LeafStoryPlanEstimateTotal','PlanEstimate','ScheduleState'],
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
            // ,
            // "removeUnauthorizedSnapshots":true
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
            // ,
            // "removeUnauthorizedSnapshots":true
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
        
        me.down('#display_box').add({
                  itemId: 'pigridboard',
                  xtype: 'rallygridboard',
                  context: context,
                  modelNames: me.modelNames,
                  toggleState: 'grid',
                  stateful: false,
                  plugins: me._getPlugins(),
                  gridConfig: {
                    store: store,
                    enableEditing: false,
                      storeConfig:{
                        filters: r_filters
                      },                       
                    columnCfgs: [
                          'Name',
                          'ScheduleState',
                          'Owner',
                          'PlanEstimate'
                      ],
                    derivedColumns: me.getDerivedColumns(),
                    shouldShowRowActionsColumn:false,
                    enableRanking: false,
                    enableBulkEdit: false
                  },
                  height: me.getHeight(),
                  width: me.getWidth()
              });

        me.setLoading(false);
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
            gridAlwaysSelectedValues: ['Name','Owner'],
            stateId: me.getContext().getScopedStateId('field-picker')
        });

        return plugins;        
    },

    _getColumnCfgs: function(){
        var me = this;

        return  [{
            dataIndex: 'Name',
            text: 'Name',
            flex:1
        },
        {
            dataIndex: 'ScheduleState',
            text: 'Schedule State'
        },
        {
            dataIndex: 'Owner',
            text: 'Owner'
        }
        ].concat(me.getDerivedColumns());
    },

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
                var values = {'lightgreen':record.get('TotalCovered'),'white': (record.get('TotalStories') - record.get('TotalCovered'))}

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
        }];
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
    }

});
