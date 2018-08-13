/**
 * This override fixes a bug in the SharedViewComboBox which prevents a newly created
 * view from appearing in the view picker until after an app reload
 */
Ext.override(Rally.ui.gridboard.SharedViewComboBox, {
    _isViewPreference: function(record) {
        return record.self.typePath === 'preference' &&
            record.get('Type') === 'View' &&
            // This is fix. Must use '==' not '===' for this to return true
            record.get('AppId') == this.getContext().getAppId();
    }
})


Ext.override(Rally.data.wsapi.TreeStore,{
    _decorateModels: function() {
        var models = this.model;

        if (_.isFunction(models.getArtifactComponentModels)) {
            models = models.getArtifactComponentModels();
        }

        Ext.Array.each(models, function(m){
                m.addField({name: 'Passing', type: 'auto',  defaultValue: 0});
                m.addField({name: 'Failing', type: 'auto', defaultValue: 0});
                m.addField({name: 'NoRun', type: 'auto',  defaultValue: 0});
                m.addField({name: 'Other', type: 'auto',  defaultValue: 0});
                m.addField({name: 'TotalStories', type: 'auto',  defaultValue: 0});
                m.addField({name: 'TotalCovered', type: 'auto',  defaultValue: 0});                
        });

        _.each(Ext.Array.from(models), Rally.ui.grid.data.NodeInterface.decorate, Rally.ui.grid.data.NodeInterface);
    }
});

// Ext.override(Rally.ui.renderer.template.ScheduleStateTemplate, {
//     _getSymbolState: function(recordData, state) {
//         var symbolState;
//         if (recordData.ScheduleStatePrefix) {
//             //
//             // if (!recordData.isDirty || this._isCreate(recordData)) {
//             //      symbolState = recordData.ScheduleStatePrefix;
//             // }  else {
//             //     symbolState = '';
//             // }
//             // overriding this as the record gets dirty after adding the task estimate to UserStory and PortfolioItems
            
//             symbolState = recordData.ScheduleStatePrefix;
            
//         } else {
//             symbolState = state === 'In-Progress' ? 'P' : state.charAt(0);
//         }
//         return symbolState;
//     }
// });

// Ext.override(Rally.ui.grid.TreeGrid, {
//     _mergeColumnConfigs: function(newColumns, oldColumns) {

//         var mergedColumns= _.map(newColumns, function(newColumn) {
//             var oldColumn = _.find(oldColumns, {dataIndex: this._getColumnName(newColumn)});
//             if (oldColumn) {
//                 return this._getColumnConfigFromColumn(oldColumn);
//             }

//             return newColumn;
//         }, this);
//         mergedColumns = mergedColumns.concat(this.config.derivedColumns);
//         return mergedColumns;
//     },
//     _restoreColumnOrder: function(columnConfigs) {

//         var currentColumns = this._getColumnConfigsBasedOnCurrentOrder(columnConfigs);
//         var addedColumns = _.filter(columnConfigs, function(config) {
//             return !_.find(currentColumns, {dataIndex: config.dataIndex}) || Ext.isString(config);
//         });

//         return currentColumns.concat(addedColumns);
//     },
//     _applyStatefulColumns: function(columns) {
//         if (this.alwaysShowDefaultColumns) {
//             _.each(this.columnCfgs, function(columnCfg) {
//                 if (!_.any(columns, {dataIndex: this._getColumnName(columnCfg)})) {
//                     columns.push(columnCfg);
//                 }
//             }, this);
//         }
//         if (this.config && this.config.derivedColumns){
//             this.columnCfgs = columns.concat(this.config.derivedColumns);
//         } else {
//             this.columnCfgs = columns;
//         }
//     }
// });


Ext.override(Rally.ui.grid.TreeGrid, {
    _mergeColumnConfigs: function(newColumns, oldColumns) {

        var mergedColumns = _.map(newColumns, function(newColumn) {
            var oldColumn = _.find(oldColumns, { dataIndex: this._getColumnName(newColumn) });
            if (oldColumn) {
                return this._getColumnConfigFromColumn(oldColumn);
            }

            return newColumn;
        }, this);
        if (this.config && this.config.derivedColumnCfgs) {
            mergedColumns = mergedColumns.concat(this.config.derivedColumnCfgs);
        }
        return mergedColumns;
    },

    _getColumnConfigsBasedOnCurrentOrder: function(columnConfigs) {
        var cols = _(this.headerCt.items.getRange()).map(function(column) {
            //override:  Added additional search for column.text
            return _.contains(columnConfigs, column.dataIndex) ? column.dataIndex : _.find(columnConfigs, { xtype: column.xtype, text: column.text });
        }).compact().value();

        return cols;
    },

    _restoreColumnOrder: function(columnConfigs) {

        var currentColumns = this._getColumnConfigsBasedOnCurrentOrder(columnConfigs);
        var addedColumns = _.filter(columnConfigs, function(config) {
            return !_.find(currentColumns, { dataIndex: config.dataIndex }) || Ext.isString(config);
        });

        return currentColumns.concat(addedColumns);
    },

    _applyStatefulColumns: function(columns) {
        // TODO (tj) test default columns
        if (this.alwaysShowDefaultColumns) {
            _.each(this.columnCfgs, function(columnCfg) {
                if (!_.any(columns, { dataIndex: this._getColumnName(columnCfg) })) {
                    columns.push(columnCfg);
                }
            }, this);
        }

        if (this.config && this.config.derivedColumnCfgs) {
            // Merge the derived column config with the stateful column if the dataIndex is the same,
            // Otherwise add the derived columns if they aren't present.
            //this.columnCfgs = columns.concat(this.config.derivedColumnCfgs);
            _.each(this.config.derivedColumnCfgs, function(derivedColumnCfg) {
                // Search by dataIndex or text
                var columnName = this._getColumnName(derivedColumnCfg);
                var columnState = _.find(columns, function(value) {
                    return (value.dataIndex === columnName || value.text === columnName);
                });
                if (columnState) {
                    // merge them (add renderer)
                    _.merge(columnState, derivedColumnCfg);
                }
                else {
                    // insert the derived column at the end
                    columns.push(derivedColumnCfg);
                }
            }, this);
        }

        this.columnCfgs = columns;
    },

    // derived columns likely don't use Rally.data.wsapi.Field, and don't have getUUID.
    // This override tests for getUUID function BEFORE calling it
    _getPersistableColumnConfig: function(column) {
        var columnConfig = this._getColumnConfigFromColumn(column),
            field = this._getModelField(columnConfig.dataIndex);
        if (field && field.getUUID) {
            columnConfig.dataIndex = field.getUUID();
        }
        return columnConfig;
    },

    /**
     * Override to support template columns that don't use a dataIndex
     */
    _getColumnName: function(column) {
        var result = '';
        if (_.isString(column)) {
            result = column;
        }
        else if (column && column.dataIndex) {
            result = column.dataIndex;
        }
        else if (column && column.text) {
            result = column.text;
        }
        return result;
    },
});

Ext.override(Rally.data.wsapi.ParentChildMapper, {

    constructor: function() {
        this.parentChildTypeMap = {
            hierarchicalrequirement: [
                {typePath: 'defect', collectionName: 'Defects', parentField: 'Requirement'},
                {typePath: 'testcase', collectionName: 'TestCases', parentField: 'WorkProduct'},
                {typePath: 'hierarchicalrequirement', collectionName: 'Children', parentField: 'Parent'}
            ],
            defect: [
                {typePath: 'testcase', collectionName: 'TestCases', parentField: 'WorkProduct'}
            ],
            defectsuite: [
                {typePath: 'defect', collectionName: 'Defects', parentField: 'DefectSuites'},
                {typePath: 'testcase', collectionName: 'TestCases', parentField: 'WorkProduct'}
            ],
            testset: [
                {typePath: 'testcase', collectionName: 'TestCases', parentField: 'TestSets'}
            ],
            testcase: [
                {typePath: 'defect', collectionName: 'Defects', parentField: 'TestCase'}
            ],
            attributedefinition: [
                {typePath: 'allowedattributevalue', collectionName: 'AllowedValues', parentField: 'AttributeDefinition'}
            ]
        };
    }
});



// Ext.override(Ext.data.TreeStore, {

//     doSort: function(sorterFn) {
//         var me = this;
//         console.log(sorterFn,me.sorters.getRange());
//         if (me.remoteSort) {
//             //the load function will pick up the new sorters and request the sorted data from the proxy
//             me.load();
//         } else {
//             me.tree.sort(sorterFn, true);
//             me.fireEvent('datachanged', me);
//             me.fireEvent('refresh', me);
//         }
//         me.fireEvent('sort', me, me.sorters.getRange());
//     }
// });