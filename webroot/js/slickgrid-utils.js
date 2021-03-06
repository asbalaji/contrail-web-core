/*
 * Copyright (c) 2014 Juniper Networks, Inc. All rights reserved.
 */
window.URL = window.URL || window.webkitURL;

function getDefaultGridConfig() {
    var defaultSettings = {
        header: {
            title: false,
            icon: false,
            defaultControls: {
				collapseable: true,
				exportable: true,
				refreshable: false,
				searchable: true
			},
			customControls: false
        },
        columnHeader: {
            columns: {}
        },
        body: {
            options: {
                actionCell: false,
                autoHeight: true,
                autoRefresh: false,
                checkboxSelectable: false,
                detail: false,
                enableCellNavigation: true,
                enableColumnReorder: false,
                enableTextSelectionOnCells: true,
                fullWidthRows: true,
                multiColumnSort: true,
                rowHeight: 30,
                gridHeight: 500,
                rowSelectable: false,
                sortable: true,
                lazyLoading: false
            },
            dataSource: {
                remote: null,
                data: null,
            	events: {}
            },
            statusMessages: {
            	loading: {
            		type: 'status',
            		iconClasses: '',
            		text: 'Loading...'
            	},
            	empty: {
            		type: 'status',
            		iconClasses: '',
            		text: 'No Records Found.'
            	},
            	error: {
            		type: 'error',
            		iconClasses: 'icon-warning',
            		text: 'Error - Please try again later.'
            	}
            }
        },
        footer: false
    };
    return defaultSettings;
};

(function ($) {
    $.fn.contrailGrid = function (customGridConfig) {
    	if(contrail.checkIfExist(this.data('contrailGrid'))){
    		this.data('contrailGrid').destroy();
    	}
        this.addClass('contrail-grid');

        var gridConfig = {}, defaultGridConfig = getDefaultGridConfig(),
        	grid = null, dataView = null, pager = null,
        	gridDataSource, gridColumns, gridOptions,
        	autoRefreshInterval = false, searchColumns = [],
            headerTemplate, remoteConfig = {}, ajaxConfig,
            dvConfig = null, gridContainer = this, 
            eventHandlerMap = {grid: {}, dataView: {}}, 
            scrolledStatus = {scrollLeft: 0, scrollTop: 0};

        // Extending the params with default settings
        $.extend(true, gridConfig, defaultGridConfig, customGridConfig);

        gridDataSource = gridConfig.body.dataSource;
        gridColumns = gridConfig.columnHeader.columns;
        gridOptions = gridConfig.body.options;
        gridConfig.footer = ($.isEmptyObject(gridConfig.footer)) ? false : gridConfig.footer;

        //Local Datasource means the client-side data with client-side pagination if footer initialized
        if (contrail.checkIfExist(gridDataSource.data)) {
            dataView = new ContrailDataView();
            initContrailGrid(dataView);
            initDataView();
            dataView.setData(gridDataSource.data);
            dataView.setSearchFilter(searchColumns, searchFilter);
            initClientSidePagination();
            initGridFooter();
        } else if (contrail.checkIfExist(gridDataSource.remote)) {
            ajaxConfig = gridDataSource.remote.ajaxConfig;
            if(contrail.checkIfExist(ajaxConfig) && contrail.checkIfExist(ajaxConfig.url)) {
            	if(gridDataSource.remote.serverSidePagination) {
                    initContrailGrid([]);
                    initGridFooter(gridDataSource.remote.serverSidePagination);
                } else {
                    dvConfig = {remote: remoteConfig};
                    $.extend(true, remoteConfig, gridDataSource.remote, {
                        initCallback: function () {
                            gridContainer.data('contrailGrid').showGridMessage('loading');
                            if(contrail.checkIfFunction(gridDataSource.events.onRequestStartCB)) {
                                gridDataSource.events.onRequestStartCB();
                            }
                        },
                        successCallback: function (response) {
                            if(response.length == 0){
                                emptyGridHandler();
                            } else {
                                gridContainer.data('contrailGrid').removeGridMessage();
                                gridContainer.find('grid-footer').show();
                            }
                            if(contrail.checkIfFunction(gridDataSource.events.onRequestSuccessCB)) {
                                gridDataSource.events.onRequestSuccessCB(response);
                            }
                            initDataView();
                            dataView.setData(response);
                            dataView.setSearchFilter(searchColumns, searchFilter);
                            initClientSidePagination();
                            initGridFooter();
                        },
                        refreshSuccessCallback: function (response, refreshDataOnly) {
                            if(response.length == 0){
                                emptyGridHandler();
                            }
                            //gridContainer.find('.grid-load-status').before('<div class="grid-body"></div>');
                            if(contrail.checkIfFunction(gridDataSource.events.onRequestSuccessCB)) {
                                gridDataSource.events.onRequestSuccessCB(response);
                            }
                            dataView.setData(response);
                        },
                        failureCallback: function (xhr) {
                            stopAutoRefresh();
                            var errorMsg = contrail.parseErrorMsgFromXHR(xhr);
                            showMessagePopup('Error', 'Error in run query: ' + errorMsg);
                            errorGridHandler(errorMsg);
                            if(contrail.checkIfFunction(gridDataSource.events.onRequestErrorCB)) {
                                gridDataSource.events.onRequestErrorCB();
                            }
                        }
                    });
                    dataView = new ContrailDataView(dvConfig);
                    initContrailGrid(dataView);
                }
            }
        } else if(contrail.checkIfExist(gridDataSource.dataView)) {
            dataView = gridDataSource.dataView;
            initDataView();
            initContrailGrid(dataView);
            dataView.setSearchFilter(searchColumns, searchFilter);
            initClientSidePagination();
            initGridFooter();
            gridContainer.data('contrailGrid').removeGridMessage();
            if(dataView.getLength() == 0){
                gridContainer.data('contrailGrid').showGridMessage('empty');
            }
        }

        function searchFilter(item, args) {
        	if (args.searchString == ""){
        		return true;
        	} else {
        		var returnFlag = false;
            	$.each(args.searchColumns, function(key, val){
            		var queryString = String(item[val.field]);
            		if(typeof val.formatter !== 'undefined'){
                		queryString = String(val.formatter(0, 0, 0, 0, item));
            		}
            		if(queryString.toLowerCase().indexOf(args.searchString.toLowerCase()) != -1){
            			returnFlag = true;
            		}
            	});
            	return returnFlag;
        	}
        };
        
        function startAutoRefresh(refreshPeriod){
            if(refreshPeriod && !autoRefreshInterval){
	        	autoRefreshInterval = setInterval(function(){
	        		if(gridContainer.find('.grid-body').is(':visible')){
	        			gridContainer.data('contrailGrid').refreshData();
	        		}
	        		else{
	        			stopAutoRefresh();
	        		}
	        	},refreshPeriod*1000);
        	}
        }
        function stopAutoRefresh(){
        	if(autoRefreshInterval){
        		clearInterval(autoRefreshInterval);
        		autoRefreshInterval = false;
        	}
        }

        function initContrailGrid(dataObject){
            initGridHeader();
            initGridBodyOptions();
            gridContainer.append('<div class="grid-body"></div>');
            if(gridOptions.autoHeight == false){
            	gridContainer.find('.grid-body').height(gridOptions.gridHeight);
            }
            grid = new Slick.Grid(gridContainer.find('.grid-body'), dataObject, gridColumns, gridOptions);
            gridContainer.append('<div class="grid-load-status hide"></div>');
            initGridEvents();
            setDataObject4ContrailGrid();
            if(contrail.checkIfExist(dataView) && dataView.getLength() == 0){
            	gridContainer.data('contrailGrid').showGridMessage('empty');
            }
        };

        function initGridHeader() {
            // Grid Header - Title + Other Actions like Expand/Collapse, Search and Custom actions
            if (gridConfig.header) {
                headerTemplate = Handlebars.compile(generateGridHeaderTemplate(gridConfig.header));
                gridContainer.append(headerTemplate(gridConfig.header.title));

                gridContainer.find('.grid-widget-header .widget-toolbar-icon').on('click', function(e) {
                    var command = $(this).attr('data-action'),
                        gridHeader = $(this).parents(".grid-header");
                    
                    switch (command) {
	                    case 'search':
	                        gridHeader.find('.link-searchbox').toggle();
	                        gridHeader.find('.input-searchbox').toggle();
	                        if(gridHeader.find('.input-searchbox').is(':visible')){
	                            gridHeader.find('.input-searchbox input').focus();
	                        } else {
	                            gridHeader.find('.input-searchbox input').val('');
	                        }
	                        e.stopPropagation();
                        break;
	                    case 'refresh':
	                    	gridContainer.data('contrailGrid').refreshData();
	                    break;
	                    case 'export':
	                        var gridDSConfig = gridDataSource,
	                            gridData = [], dv;
	                        
	                        gridContainer.find('a[data-action="export"] i').removeClass('icon-download-alt').addClass('icon-spin icon-spinner');
	                        gridContainer.find('a[data-action="export"]').prop('title','Exporting...').data('action','exporting').addClass('blue');
	                        if(contrail.checkIfExist(gridDSConfig.remote) && gridDSConfig.remote.serverSidePagination) {
                                var exportCB =  gridDSConfig.remote.exportFunction;
                                if(exportCB != null) {
                                    exportCB(gridConfig, gridContainer);
                                }
	                        } else {
	                            dv = gridContainer.data('contrailGrid')._dataView;
	                            gridData = dv.getItems();
                                exportGridData2CSV(gridConfig, gridData);
	                            setTimeout(function(){
		                            gridContainer.find('a[data-action="export"] i').addClass('icon-download-alt').removeClass('icon-spin icon-spinner');
		                        	gridContainer.find('a[data-action="export"]').prop('title','Export as CSV').data('action','export').removeClass('blue');
	                            },500);
	                        }
                        break;
	                    case 'collapse':
	                    	gridHeader.find('i.collapse-icon').toggleClass('icon-chevron-up').toggleClass('icon-chevron-down');
	                    	
	                    	if(gridHeader.find('i.collapse-icon').hasClass('icon-chevron-up')){
	                			gridContainer.children().show();
	                    	} else if(gridHeader.find('i.collapse-icon').hasClass('icon-chevron-down')){
	                    		gridContainer.children().hide();
	                    		gridHeader.show();
	                    	}
	                    break;
                    }
                });

                $.each(gridColumns, function(key,val){
                	// Setting searchable:true for columns wherever necessary
                	if(gridConfig.header.defaultControls.searchable){
                		if(typeof val.searchable == 'undefined' || val.searchable != false)
                            searchColumns.push(val);
                	}
                	
                	// Setting sortable:true for columns wherever necessary
                	if(gridOptions.sortable){
                		if(!contrail.checkIfExist(val.sortable)){
                			gridColumns[key].sortable = true;
                		}
                    }
                	else{
                		gridColumns[key].sortable = false;
                	}
                	
                	if(!contrail.checkIfExist(gridColumns[key].id)){
                		gridColumns[key].id = val.field + '_' + key;
                	}
                	
                });
            }
        };

        function initGridBodyOptions() {
        	if(contrail.checkIfExist(gridOptions)){
        		var columns = [];
	
	            // Adds checkbox to all rows and header for select all functionality
	            if(gridOptions.checkboxSelectable != false) {
	                columns = [];
	                columns.push({
	                    cssClass: "slick-cell-checkboxsel",
	                    id: "slick_sel",
	                    field: "sel",
	                    formatter: function(r, c, v, cd, dc) {
	                        return '<input type="checkbox" class="ace-input rowCheckbox" value="' + r +'"/> <span class="ace-lbl"></span>';
	                    },
	                    id: "_checkbox_selector",
	                    name: '<input type="checkbox" class="ace-input headerRowCheckbox" /> <span class="ace-lbl"></span>',
	                    resizable: false,
	                    sortable: false,
	                    toolTip: "Select/Deselect All",
	                    width: 30,
	                    searchable: false,
	                    exportConfig: {
	                        allow: false
	                    }
	                });
	                
	                var onNothingChecked = contrail.checkIfFunction(gridOptions.checkboxSelectable.onNothingChecked) ? gridOptions.checkboxSelectable.onNothingChecked : null,
	                	onSomethingChecked = contrail.checkIfFunction(gridOptions.checkboxSelectable.onSomethingChecked) ? gridOptions.checkboxSelectable.onSomethingChecked : null,
						onEverythingChecked = contrail.checkIfFunction(gridOptions.checkboxSelectable.onEverythingChecked) ? gridOptions.checkboxSelectable.onEverythingChecked : null;
	                
	                columns = columns.concat(gridColumns);
	                gridColumns = columns;
	
	                gridContainer.find('.headerRowCheckbox').live('click', function(){
	                    if($(this).attr('checked') == 'checked'){
	                        gridContainer.find('.rowCheckbox').attr('checked','checked');
	                        (contrail.checkIfExist(onSomethingChecked) ? onSomethingChecked() : '');
	                        (contrail.checkIfExist(onEverythingChecked) ? onEverythingChecked() : '');
	                    } else {
	                        gridContainer.find('.rowCheckbox').removeAttr('checked');
	                        (contrail.checkIfExist(onNothingChecked) ? onNothingChecked() : '');
	                    }
	                });
	                
	                gridContainer.find('.rowCheckbox').live('click', function(){
	                    if($(this).attr('checked') != 'checked'){
	                        gridContainer.find('.headerRowCheckbox').removeAttr('checked');
	                    }
	                    
	                    var headerRowChecked = true, rowChecked = false;
                    	gridContainer.find('.rowCheckbox').each(function(key,val){
                    		headerRowChecked = headerRowChecked && (($(this).attr('checked') == 'checked') ? true : false);
                    		rowChecked = rowChecked || (($(this).attr('checked') == 'checked') ? true : false);
                    	});
                    	
                    	if(headerRowChecked) {
                    		gridContainer.find('.headerRowCheckbox').attr('checked','checked');
                    		(contrail.checkIfExist(onSomethingChecked) ? onSomethingChecked() : '');
                    		(contrail.checkIfExist(onEverythingChecked) ? onEverythingChecked() : '');
                    	}else if(rowChecked) {
                    		(contrail.checkIfExist(onSomethingChecked) ? onSomethingChecked() : '');
                    	}else {
                    		(contrail.checkIfExist(onNothingChecked) ? onNothingChecked() : '');
                    	}
	                });
	            }

	            if (gridOptions.detail != false) {
	                columns = [];
	                columns.push({
	                    focusable: true,
	                    formatter: function(r, c, v, cd, dc) {
	                        return '<i class="icon-caret-right margin-0-5 toggleDetailIcon"></i>';
	                    },
	                    id: "_detail_row_icon",
	                    rerenderOnResize: false,
	                    resizable: false,
	                    selectable: true,
	                    sortable: false,
	                    width: 30,
	                    searchable: false,
	                    exportConfig: {
	                        allow: false
	                    },
	                    events: {
	            			onClick: function(e,dc){
	            				var target = e.target;
                                if($(target).hasClass('icon-caret-right')){
                                	
                                	if(!$(target).parents('.slick-row-master').next().hasClass('slick-row-detail')){
	                                	var cellSpaceColumn = 1,
	                                    	cellSpaceRow = gridColumns.length - 1;
	
	                                    if (gridOptions.checkboxSelectable != false) {
	                                        cellSpaceColumn++;
	                                    }
	
	                                    var source = gridOptions.detail.template;
	                                    source = source.replace(/ }}/g, "}}");
	                                    source = source.replace(/{{ /g, "{{");
	
	                                    var template = Handlebars.compile(source);
	                                    $(target).parents('.slick-row-master').after(' \
	            	            				<div class="ui-widget-content slick-row slick-row-detail" data-id="' + $(target).parents('.slick-row-master').data('id') + '"> \
	            	            					<div class="slick-cell l' + cellSpaceColumn + ' r' + cellSpaceRow + '"> \
	            		            					<div class="slick-row-detail-container"> \
	            	            							' + template(dc) + ' \
	            	            						</div> \
	            	            					</div> \
	            	            				</div>');
	
	                                    $(target).parents('.slick-row-master').next('.slick-row-detail').find('.slick-row-detail-container').show();
	                                    
	                                    // onInit called after building a template
	                                	if(contrail.checkIfFunction(gridOptions.detail.onInit)){
	                                		e['detailRow'] = $(target).parents('.slick-row-master').next().find('.slick-row-detail-container');
	                                		gridOptions.detail.onInit(e,dc);
	                                    }
	                                    gridContainer.data('contrailGrid').adjustDetailRowHeight($(target).parents('.slick-row-master').data('id'));
                                	}
                                	else{
                                		$(target).parents('.slick-row-master').next('.slick-row-detail').show();
                                	}
                                	
                                    if(contrail.checkIfFunction(gridOptions.detail.onExpand)){
                                    	gridOptions.detail.onExpand(e,dc);
                                    }
                                    $(target).removeClass('icon-caret-right').addClass('icon-caret-down');
                                }
                                else if($(target).hasClass('icon-caret-down')){
                                    $(target).parents('.slick-row-master').next('.slick-row-detail').hide();
                                    
                                    if(contrail.checkIfFunction(gridOptions.detail.onCollapse)){
                                    	gridOptions.detail.onCollapse(e,dc);
                                    }
                                    $(target).removeClass('icon-caret-down').addClass('icon-caret-right');
                                }
	            			}
	            		}
	                });
	                columns = columns.concat(gridColumns);
	                gridColumns = columns;
	                
	                gridContainer.find('.slick-row-detail').live('click', function(){
	                	var rowId = $(this).data('id');
	                	setTimeout(function(){
	                	    if(gridContainer.data('contrailGrid') != null)
	                	        gridContainer.data('contrailGrid').adjustDetailRowHeight(rowId);
	                	},100);
	                });
	            }
	            
	            if (gridOptions.actionCell != false && gridOptions.actionCell.length > 0) {
	            	columns = [];
	                columns.push({
	                	id: 'slick_action_cog',
	                    field:"",
	                    cssClass: 'action-cog-cell',
	                    rerenderOnResize: false,
	                    width: 20,
	                    resizable: false,
	                    formatter: function(r, c, v, cd, dc) {
	                    	var actionCellArray = [];
	                        if(contrail.checkIfFunction(gridOptions.actionCell)){
	                            actionCellArray = gridOptions.actionCell(dc);
	                        } else{
	                            actionCellArray = gridOptions.actionCell;
	                        }
	                        
	                        return (actionCellArray.length > 0) ? '<i class="icon-cog icon-only bigger-110 grid-action-cog"></i>' : '';
	                    },
	                    searchable: false,
	                    sortable: false,
	                    exportConfig: {
	                        allow: false
	                    }
	                });
	                columns = gridColumns.concat(columns);
	                gridColumns = columns;
	            }
        	}
        };
        
        function initGridEvents() {
        	
        	eventHandlerMap.grid['onScroll'] = function(e, args){
        		if(scrolledStatus.scrollLeft != args.scrollLeft || scrolledStatus.scrollTop != args.scrollTop){
                	gridContainer.data('contrailGrid').adjustAllRowHeight();
                	scrolledStatus.scrollLeft = args.scrollLeft;
                	scrolledStatus.scrollTop = args.scrollTop;
            	}
        	};
        	
        	grid['onScroll'].subscribe(eventHandlerMap.grid['onScroll']);
        	
        	eventHandlerMap.grid['onClick'] = function (e, args) {
            	var column = grid.getColumns()[args.cell],
            		rowData = grid.getDataItem(args.row);
                gridContainer.data('contrailGrid').selectedRow = args.row;
                gridContainer.data('contrailGrid').selectedCell = args.cell;

                if(contrail.checkIfExist(gridConfig.body.events) && contrail.checkIfFunction(gridConfig.body.events.onClick)){
                	gridConfig.body.events.onClick(e,rowData);
                }
                
                if(contrail.checkIfExist(column.events) && contrail.checkIfFunction(column.events.onClick)){
                	column.events.onClick(e,rowData);
                }
                
                if(gridOptions.rowSelectable){
                    if(!gridContainer.find('.slick_row_' + rowData.id).hasClass('selected_row')){
                        gridContainer.find('.selected_row').removeClass('selected_row');
                        gridContainer.find('.slick_row_' + rowData.id).addClass('selected_row');
                    }
                }

                setTimeout(function(){
                    if(gridContainer.data('contrailGrid') != null)
                        gridContainer.data('contrailGrid').adjustRowHeight(rowData.id);
                },50);

                if ($(e.target).hasClass("grid-action-cog")) {
                    if($('#' + gridContainer.prop('id') + '-action-menu-' + args.row).is(':visible')){
                    	$('#' + gridContainer.prop('id') + '-action-menu-' + args.row).remove();
                    } else {
                    	$('.grid-action-menu').remove();
                        var actionCellArray = [];
                        if(contrail.checkIfFunction(gridOptions.actionCell)){
                            actionCellArray = gridOptions.actionCell(rowData);
                        } else{
                            actionCellArray = gridOptions.actionCell;
                        }

                        //$('#' + gridContainer.prop('id') + '-action-menu').remove();
                        generateGridActionTemplate(actionCellArray, gridContainer, args.row);
                        var offset = $(e.target).offset();
                        $('#' + gridContainer.prop('id') + '-action-menu-' + args.row).css({
                            top: offset.top+20 + 'px',
                            left: offset.left-155 + 'px'
                        }).show();
                        e.stopPropagation();
                        initOnClickDocument($('#' + gridContainer.prop('id') + '-action-menu-' + args.row),function(){
                        	$('#' + gridContainer.prop('id') + '-action-menu-' + args.row).hide();
                        });
                    }
                }
            };
            
            grid['onClick'].subscribe(eventHandlerMap.grid['onClick']);
        };
        
        function initOnClickDocument(container, callback) {
        	$(document).on('click',function (e) {
   			    if (!container.is(e.target) && container.has(e.target).length === 0){
   			    	callback();
   			    }
    		});
        };
        
        function initDataView() {
            eventHandlerMap.dataView['onRowCountChanged'] = function (e, args) {
                //Refresh the grid only if it's not destroyed
                if($(gridContainer).data('contrailGrid')) {
                    grid.updateRowCount();
                    grid.render();

                    gridContainer.data('contrailGrid').removeGridMessage();
                    if(dataView.getLength() == 0){
                        emptyGridHandler();
                    } else {
                        gridContainer.find('.grid-footer').show();
                        onDataGridHandler();
                    }
                }
            };
            
            eventHandlerMap.dataView['onRowsChanged'] = function (e, args) {
                //Refresh the grid only if it's not destroyed
                
                setTimeout(function(){
                	if($(gridContainer).data('contrailGrid')) {
                        grid.invalidateRows(args.rows);
                        grid.render();
                        if(contrail.checkIfFunction(gridDataSource.events.onDataBoundCB)) {
                            gridDataSource.events.onDataBoundCB();
                        }
                        // Adjusting the row height for all rows
                        gridContainer.data('contrailGrid').adjustAllRowHeight();

                        // Assigning odd and even classes to take care of coloring effect on alternate rows
                        gridContainer.data('contrailGrid').adjustGridAlternateColors();

                        gridContainer.find('.slick-row-detail').hide();
                    }
                }, 50);
            };
            
            eventHandlerMap.dataView['onUpdateData'] = function () {
                //Refresh the grid only if it's not destroyed
                if($(gridContainer).data('contrailGrid')) {
                    if(contrail.checkIfFunction(gridDataSource.events.onUpdateDataCB)) {
                        gridDataSource.events.onUpdateDataCB();
                    }
                }
            };
            
            $.each(eventHandlerMap.dataView, function(key, val){
            	dataView[key].subscribe(val);
            });
        };

        function initClientSidePagination() {
        	eventHandlerMap.grid['onSort'] = function (e, args) {
        		var cols = args.sortCols;
        		var comparer = function (dataRow1, dataRow2) {
        			for (var i = 0, l = cols.length; i < l; i++) {
        				var field = cols[i].sortCol.field;
        				var sign = cols[i].sortAsc ? 1 : -1;
        				var value1 = (contrail.checkIfExist(cols[i].sortCol.sortable.sortBy) && cols[i].sortCol.sortable.sortBy == 'formattedValue') ? cols[i].sortCol.formatter('','','','',dataRow1) : dataRow1[field], 
        					value2 = (contrail.checkIfExist(cols[i].sortCol.sortable.sortBy) && cols[i].sortCol.sortable.sortBy == 'formattedValue') ? cols[i].sortCol.formatter('','','','',dataRow2) : dataRow2[field];
        				var result = (value1 == value2 ? 0 : (value1 > value2 ? 1 : -1)) * sign;
        				if (result != 0) {
        					return result;
        				}
        			}
        			return 0;
        		};
        		dataView.sort(comparer, args.sortAsc);
        	};
        	
        	grid['onSort'].subscribe(eventHandlerMap.grid['onSort']);
        	
            initSearchBox();
        };

        function initSearchBox() {
            // Search Textbox Keyup
            gridContainer.find('.input-searchbox input').on('keyup', function(e) {
                dataView.setFilterArgs({
                    searchString: this.value,
                    searchColumns: searchColumns
                });
                dataView.refresh();
                $(this).focus();
            });
            
            initOnClickDocument(gridContainer.find('.input-searchbox'),function(){
            	if(gridContainer.find('.input-searchbox').is(':visible')){
                	gridContainer.find('.input-searchbox').hide();
                	gridContainer.find('.link-searchbox').show();
            	}
            });
        }

        function initGridFooter(serverSidePagination) {
            if(gridConfig.footer != false) {
                gridContainer.append('<div class="grid-footer hide"></div>');
                if(serverSidePagination) {
                    pager = new Slick.Controls.EnhancementPager({
                        gridContainer: gridContainer,
                        container: $(gridContainer.find('.grid-footer')),
                        gridConfig: gridConfig,
                        remoteUrl: gridDataSource.remote.ajaxConfig.url,
                        datagrid: grid,
                        params: gridDataSource.remote.ajaxConfig.data,
                        events: gridDataSource.events,
                        options: gridConfig.footer.pager.options
                    });
                } else {
                	if(dataView.getLength() != 0){
                    	gridContainer.find('.grid-footer').show();
                    }
                    pager = new SlickGridPager(dataView, gridContainer, gridConfig.footer.pager.options);
                    pager.init();
                }
            }
            gridContainer.data("contrailGrid")._pager = pager;
            startAutoRefresh(gridOptions.autoRefresh);
        };

        function setDataObject4ContrailGrid() {
            gridContainer.data('contrailGrid', {
                _grid: grid,
                _dataView: dataView,
                _eventHandlerMap: eventHandlerMap,
                _pager: pager,
                expand: function(){
                	gridContainer.find('i.collapse-icon').addClass('icon-chevron-up').removeClass('icon-chevron-down');
            		gridContainer.children().show();
                },
                collapse: function(){
                	gridContainer.find('i.collapse-icon').removeClass('icon-chevron-up').addClass('icon-chevron-down');
                    gridContainer.children().hide();
                    gridContainer.find('.grid-header').show();
                },
                getCheckedRows: function(){
                    var returnValue = [];
                    gridContainer.find('.rowCheckbox:checked').each(function(key, val){
                        returnValue.push(grid.getDataItem($(this).val()));
                    });
                    return returnValue;
                },
                getSelectedRow: function(){
                    return grid.getDataItem(gridContainer.data('contrailGrid').selectedRow);
                },
                deleteDataByRows: function(rowIndices){
                	var ids = [];
                	$.each(rowIndices, function(key, val){
                		var dataItem = grid.getDataItem(val);
                		ids.push(dataItem.id);
                	});
                	dataView.deleteDataByIds(ids);
                },
                showGridMessage: function(status, customMsg){
                    var gridStatusMsgConfig = gridConfig.body.statusMessages,
                        statusMsg = contrail.checkIfExist(customMsg) ? customMsg : (contrail.checkIfExist(gridStatusMsgConfig[status]) ? gridStatusMsgConfig[status].text : ''),
                        messageHtml;
                	this.removeGridMessage();
                	if(status == 'loading'){
                		gridContainer.find('.grid-header-icon-loading').show();
                	}
                	messageHtml = (contrail.checkIfExist(gridStatusMsgConfig[status])) ? '<p class="' + gridStatusMsgConfig[status].type + '"><i class="' + gridStatusMsgConfig[status].iconClasses + '"></i> ' + statusMsg + '</p>' : status;
                	gridContainer.find('.grid-load-status').html(messageHtml).show();

                },
                removeGridMessage: function(){
                    gridContainer.find('.grid-load-status').html('').hide();
                    if(gridOptions.lazyLoading == null || !gridOptions.lazyLoading) {
                        this.removeGridLoading();
                    }
                },
                removeGridLoading: function(){
                    gridContainer.find('.grid-header-icon-loading').hide();
                },
                adjustAllRowHeight: function() {
                	var self = this;
                    gridContainer.find('.slick-row-master').each(function(){
                    	self.adjustRowHeight($(this).data('id'));
                    });
                },
                adjustRowHeight: function(rowId) {
                    var maxHeight = 20;
                    gridContainer.find('.slick_row_' + rowId).find('.slick-cell').each(function(){
                        maxHeight = ($(this).height() > maxHeight) ? $(this).height() : maxHeight;
                    });

                    gridContainer.find('.slick_row_' + rowId).height(maxHeight + 10);
                },
                adjustDetailRowHeight: function(rowId){
                	var slickdetailRow = gridContainer.find('.slick_row_' + rowId).next('.slick-row-detail'),
                    	detailContainerHeight = slickdetailRow.find('.slick-row-detail-container').height();
                	slickdetailRow.height(detailContainerHeight+10);
                	slickdetailRow.find('.slick-cell').height(detailContainerHeight);
                },
                adjustGridAlternateColors: function(){
                	gridContainer.find('.slick-row-master').removeClass('even').removeClass('odd');
    	            gridContainer.find('.slick-row-master:visible:even').addClass('even');
    	            gridContainer.find('.slick-row-master:visible:odd').addClass('odd');
                },
                destroy: function(){
                	stopAutoRefresh();
                   	$.each(eventHandlerMap.dataView, function(key, val){
                       	dataView[key].unsubscribe(val);
                   	});
                    
                   	$.each(eventHandlerMap.grid, function(key, val){
                       	grid[key].unsubscribe(val);
                    });
                   	
                	gridContainer.data('contrailGrid')._grid.destroy();
                    gridContainer.data('contrailGrid', null);
                    gridContainer.html('').removeClass('contrail-grid');
                },
                setRemoteAjaxConfig: function(ajaxConfig) {
                    if(contrail.checkIfExist(gridDataSource.remote.ajaxConfig)) {
                        dataView.setRemoteAjaxConfig(ajaxConfig);
                        dvConfig.remote.ajaxConfig = ajaxConfig;
                        gridDataSource.remote.ajaxConfig = ajaxConfig;
                        customGridConfig.body.dataSource.remote.ajaxConfig = ajaxConfig;
                        return true;
                    } else {
                        return false;
                    }
                },
                /*
                 * Refreshes the grid if the grid data is fetched via ajax call
                 */
                refreshGrid: function(){
                    if (contrail.checkIfExist(gridDataSource.remote) && contrail.checkIfExist(gridDataSource.remote.ajaxConfig.url)) {
                        gridContainer.contrailGrid(customGridConfig);
                    } else {
                        this.refreshView();
                    }
                },
                /*
                 * Refreshes the Dataview if the grid data is fetched via ajax call
                 */
                refreshData: function() {
                    if (contrail.checkIfExist(gridDataSource.remote) && contrail.checkIfExist(gridDataSource.remote.ajaxConfig.url)) {
                        dataView.refreshData();
                    }
                },
                /*
                 * Refreshes the view of the grid. Grid is rendered and related adjustments are made.
                 */
                refreshView: function(){
                	grid.render();
                	grid.resizeCanvas();
                	gridContainer.find('.slick-row-detail').remove();
                	gridContainer.find('.icon-caret-down').toggleClass('icon-caret-down').toggleClass('icon-caret-right');
                	this.adjustAllRowHeight();
                	this.adjustGridAlternateColors();
                }, 
                /* 
                 * Starts AutoRefresh
                 */
                startAutoRefresh: function(refreshPeriod){
                	startAutoRefresh(refreshPeriod);
                }, 
                /*
                 * Stops AutoRefresh
                 */
                stopAutoRefresh: function(){
                	stopAutoRefresh();
                }
            });
        }

        function generateGridHeaderTemplate(headerConfig){
            var template = ' \
                <h4 class="grid-header-text smaller {{this.cssClass}}"> \
            		<i class="grid-header-icon-loading icon-spinner icon-spin"></i> \
                    <i class="grid-header-icon {{this.icon}} {{this.iconCssClass}} hide"></i> {{this.text}} \
                </h4>';

            if(headerConfig.defaultControls.collapseable){
                template += '\
                <div class="widget-toolbar pull-right"> \
                    <a class="widget-toolbar-icon" data-action="collapse"> \
                        <i class="collapse-icon icon-chevron-up"></i> \
                    </a> \
                </div>';
            }

            if(headerConfig.defaultControls.refreshable){
                template += '\
                <div class="widget-toolbar pull-right"> \
                    <a class="widget-toolbar-icon link-searchbox" title="Refresh" data-action="refresh"> \
                        <i class="icon-repeat"></i> \
                    </a> \
                </div>';
            }

            if(headerConfig.defaultControls.searchable){
                template += '\
                <div class="widget-toolbar pull-right"> \
                    <a class="widget-toolbar-icon link-searchbox" data-action="search"> \
                        <i class="icon-search"></i> \
                    </a> \
                    <span class="input-searchbox hide"> \
                        <span class="input-icon"> \
                            <input type="text" placeholder="Search {{this.text}}" class="input-medium input-grid-search"> \
                            <i class="widget-toolbar-icon icon-search" data-action="search"></i> \
                        </span> \
                    </span> \
                </div>';
            }

            if(headerConfig.defaultControls.exportable) {
                template += '\
                    <div class="widget-toolbar pull-right"> \
                        <a class="widget-toolbar-icon" title="Export as CSV" data-action="export"> \
                            <i class="icon-download-alt"></i> \
                        </a> \
                    </div>';
            }

            if(headerConfig.customControls){
                $.each(headerConfig.customControls, function(key,val){
                    template += '<div class="widget-toolbar pull-right">' + val + '</div>';
                });
            }

            return '<div class="grid-header"><div class="widget-header grid-widget-header">' + template + '</div></div>';
        };

        function generateGridActionTemplate(actionConfig, gridContainer, rowIndex) {
            var gridActionId = $('<ul id="' + gridContainer.prop('id') + '-action-menu-' + rowIndex + '" class="dropdown-menu pull-right dropdown-caret grid-action-menu"></ul>').appendTo('body');
            $.each(actionConfig, function(key,val){
                var actionItem = $('\
			<li><a class="tooltip-success" data-rel="tooltip" data-placement="left" data-original-title="' + val.title + '"> \
				<i class="' + val.iconClass + '"></i> &nbsp; ' + val.title + '</a> \
			</li>').appendTo('#' +gridContainer.prop('id') + '-action-menu-' + rowIndex);

                $(actionItem).on('click', function(){
                    val.onClick(rowIndex);
                    gridActionId.remove();
                });
            });
        };
        function emptyGridHandler(){
            gridContainer.data('contrailGrid').showGridMessage('empty');
            if(gridOptions.checkboxSelectable != false) {
                gridContainer.find('.headerRowCheckbox').attr('disabled', true);
            }
        };

        function errorGridHandler(errorMsg){
            gridContainer.data('contrailGrid').showGridMessage('error','Error: ' + errorMsg);
            if(gridOptions.checkboxSelectable != false) {
                gridContainer.find('.headerRowCheckbox').attr('disabled', true);
            }
        };

        function onDataGridHandler(){
            if(gridOptions.checkboxSelectable != false) {
                gridContainer.find('.headerRowCheckbox').removeAttr('disabled');
            }
        };
    };
}(jQuery));

var SlickGridPager = function (dataView, gridContainer, pagingInfo) {
    var $info = null, pageSizeSelect = pagingInfo.pageSizeSelect,
    	csgCurrentPageDropDown = null, csgPagerSizesDropdown = null,
        footerContainer = gridContainer.find('.grid-footer');

    this.init = function() {
        var eventMap = gridContainer.data('contrailGrid')._eventHandlerMap.dataView;
        eventMap['onPagingInfoChanged'] = function (e, pagingInfo) {
            pagingInfo.pageSizeSelect = pageSizeSelect;
            updatePager(pagingInfo);
            gridContainer.find('.headerRowCheckbox').removeAttr('checked');
            gridContainer.find('.rowCheckbox').removeAttr('checked');
            
        	setTimeout(function(){
        		if(contrail.checkIfExist(gridContainer.data('contrailGrid'))){
        			gridContainer.data('contrailGrid').adjustGridAlternateColors();
        		}
            },600);
            
        };
        dataView.onPagingInfoChanged.subscribe(eventMap['onPagingInfoChanged']);
        constructPagerUI();
        updatePager(pagingInfo);
        setPageSize(pagingInfo.pageSize);
    };

    function populatePagerSelect(data){
        var returnData = new Array();
        $.each(data.pageSizeSelect,function(key,val){
            returnData.push({
                id: val,
                text: String(val)
            });
        });
        returnData.push({
            id: parseInt(data.totalRows),
            text: 'All'
        });
        return returnData;
    }

    function populateCurrentPageSelect(n){
    	var returnData = new Array();
        for(var i = 0 ; i < n ; i++){
            returnData.push({
                id: i,
                text: String((i+1))
            });
        }
        return returnData;
    };

    function constructPagerUI() {
        footerContainer.empty();
        var $nav = $("<span class='slick-pager-nav' />").appendTo(footerContainer),
            iconPrefix, iconSuffix;
        $info = $("<span class='slick-pager-info' />").appendTo(footerContainer);
        $sizes = $("<span class='slick-pager-sizes' />").appendTo(footerContainer);


        // Pager Controls (pager-Nav)
        iconPrefix = '<span class="pager-control"> <i class="';
        iconSuffix = '"></i></span>';
        $(iconPrefix + "icon-step-backward" + iconSuffix).click(gotoFirst).appendTo($nav);
        $(iconPrefix + "icon-backward" + iconSuffix).click(gotoPrev).appendTo($nav);


        $('<span class="pager-page-info"> <div class="csg-current-page"></div> of <span class="csg-total-page-count"></span></span>').appendTo($nav);

        csgCurrentPageDropDown = footerContainer.find('.csg-current-page').contrailDropdown({
            placeholder: 'Select..',
            data: [{id: 0, text: '1'}],
            change: function(e){
                dataView.setPagingOptions({pageNum: e.val});
            }
        }).data('contrailDropdown');
        csgCurrentPageDropDown.value('0');

        $(iconPrefix + "icon-forward" + iconSuffix).click(gotoNext).appendTo($nav);
        $(iconPrefix + "icon-step-forward" + iconSuffix).click(gotoLast).appendTo($nav);

        $sizes.append('<div class="csg-pager-sizes"></div> Records per page');

        csgPagerSizesDropdown = footerContainer.find('.csg-pager-sizes').contrailDropdown({
            data: populatePagerSelect(pagingInfo),
            change: function(e){
                dataView.setPagingOptions({pageSize: parseInt(e.val), pageNum: 0});
            }
        }).data('contrailDropdown');
        csgPagerSizesDropdown.value(String(pagingInfo.pageSize));

        footerContainer.find(".ui-icon-container").hover(function () {
            $(this).toggleClass("ui-state-hover");
        });

        footerContainer.children().wrapAll("<div class='slick-pager' />");
    }

    function updatePager(pagingInfo) {
        var state = getNavState();
        footerContainer.find(".slick-pager-nav i").addClass("icon-disabled");
        if (state.canGotoFirst) {
            footerContainer.find(".icon-step-backward").removeClass("icon-disabled");
        }
        if (state.canGotoLast) {
            footerContainer.find(".icon-step-forward").removeClass("icon-disabled");
        }
        if (state.canGotoNext) {
            footerContainer.find(".icon-forward").removeClass("icon-disabled");
        }
        if (state.canGotoPrev) {
            footerContainer.find(".icon-backward").removeClass("icon-disabled");
        }

        $info.text("Total: " + pagingInfo.totalRows + " records");
        footerContainer.find('.csg-total-page-count').text(pagingInfo.totalPages);

        var currentPageSelectData = populateCurrentPageSelect(pagingInfo.totalPages);

        csgCurrentPageDropDown.setData(currentPageSelectData);
        csgCurrentPageDropDown.value('0');
    }

    function getNavState() {
        var pagingInfo = dataView.getPagingInfo();
        var lastPage = pagingInfo.totalPages - 1;

        return {
            canGotoFirst: pagingInfo.pageSize != 0 && pagingInfo.pageNum > 0,
            canGotoLast: pagingInfo.pageSize != 0 && pagingInfo.pageNum < lastPage,
            canGotoPrev: pagingInfo.pageSize != 0 && pagingInfo.pageNum > 0,
            canGotoNext: pagingInfo.pageSize != 0 && pagingInfo.pageNum < lastPage,
            pagingInfo: pagingInfo
        };
    }

    function setPageSize(n) {
        dataView.setRefreshHints({
            isFilterUnchanged: true
        });
        dataView.setPagingOptions({pageSize: n});
        //container.find('.csg-current-page').select2('val', String(n));
    }

    function gotoFirst() {
        if (getNavState().canGotoFirst) {
            dataView.setPagingOptions({pageNum: 0});
            csgCurrentPageDropDown.value('0');
        }
    }

    function gotoLast() {
        var state = getNavState();
        if (state.canGotoLast) {
            dataView.setPagingOptions({pageNum: state.pagingInfo.totalPages - 1});
            csgCurrentPageDropDown.value(String(state.pagingInfo.totalPages - 1));
        }
    }

    function gotoPrev() {
        var state = getNavState();
        if (state.canGotoPrev) {
            dataView.setPagingOptions({pageNum: state.pagingInfo.pageNum - 1});
            csgCurrentPageDropDown.value(String(state.pagingInfo.pageNum - 1));
        }
    }

    function gotoNext() {
        var state = getNavState();
        if (state.canGotoNext) {
            dataView.setPagingOptions({pageNum: state.pagingInfo.pageNum + 1});
            csgCurrentPageDropDown.value(String(state.pagingInfo.pageNum + 1));
        }
    }
};

var ContrailDataView = function(dvConfig) {
    var dataView = new Slick.Data.DataView({ inlineFilters: true }),
        contrailDataView = {}, remoteDataHandler = null,
        onUpdateData = new Slick.Event();

    $.extend(true, contrailDataView, dataView, {
        _idOffset: 0,
        onUpdateData: onUpdateData,
        setData: function (data) {
            // Setting id for each data-item; Required to instantiate data-view.
            setId4Idx(data, this);
            this.beginUpdate();
            this.setItems(data);
            this.endUpdate();
            onUpdateData.notify();
        },
        setSearchFilter: function(searchColumns, searchFilter) {
            this.setFilterArgs({
                searchString: '',
                searchColumns: searchColumns
            });
            this.setFilter(searchFilter);
        },
        addData: function(data){
            var dis = this;
            setId4Idx(data, this);
        	this.beginUpdate();
        	$.each(data, function(key, val){
                dis.addItem(val);
            });
        	this.endUpdate();
            onUpdateData.notify();
        },
        updateData: function(data){
        	this.beginUpdate();
        	var dis = this;
        	$.each(data, function(key,val){
        		dis.updateItem(val.id,val);
            });
        	this.endUpdate();
            onUpdateData.notify();
        },
        deleteDataByIds: function(ids){
        	this.beginUpdate();
        	var dis = this;
        	$.each(ids, function(key,val){
        		dis.deleteItem(val);
            });
        	this.endUpdate();
            onUpdateData.notify();
        },
        setRemoteAjaxConfig: function(ajaxConfig) {
            if(contrail.checkIfExist(dvConfig.remote.ajaxConfig)) {
                remoteDataHandler.setRemoteAjaxConfig(ajaxConfig);
                dvConfig.remote.ajaxConfig = ajaxConfig;
                return true;
            } else {
                return false;
            }
        },
        refreshData: function() {
            if(remoteDataHandler != null) {
                remoteDataHandler.refreshData();
            }
        }
    });

    if(dvConfig != null) {
        if (dvConfig.data != null) {
            contrailDataView.setData(dvConfig.data);
        } else if (dvConfig.remote != null && dvConfig.remote.ajaxConfig != null) {
            remoteDataHandler = new RemoteDataHandler(dvConfig.remote.ajaxConfig, dvConfig.remote.dataParser, dvConfig.remote.initHandler, function (response) {
                dvConfig.remote.successCallback(response);
            }, function (response) {
                dvConfig.remote.refreshSuccessCallback(response);
            }, function (xhr) {
                dvConfig.remote.failureCallback(xhr);
            });
        }
    }

    function setId4Idx(data, dis) {
        var offset = dis._idOffset;
        // Setting id for each data-item; Required to instantiate data-view.
        if (data.length > 0) {
            $.each(data, function (key, val) {
                if(!contrail.checkIfExist(val.id)){
                    data[key].id = 'id_' + (key + offset);
                }
            });
            dis._idOffset += data.length;
        }
    }

    return contrailDataView;
};

var RemoteDataHandler = function(config, dataParser, initCallback, successCallback, refreshSuccessCallback, failureCallback) {
    var initHandler, successHandler, refreshHandler, failureHandler, fetchData,
        requestInProgress = false, ajaxConfig = config, self = this;

    initHandler = function() {
        requestInProgress = true;
        if(contrail.checkIfFunction(initCallback)) {
            initCallback();
        }
    };

    successHandler = function(response) {
        var resultJSON;
        if(contrail.checkIfFunction(dataParser)) {
            resultJSON = dataParser(response);
        } else {
            resultJSON = response;
        }
        if(contrail.checkIfFunction(successCallback)) {
            successCallback(resultJSON);
        }
        requestInProgress = false;
    };

    refreshHandler = function(response) {
        var resultJSON;
        if(contrail.checkIfFunction(dataParser)) {
            resultJSON = dataParser(response);
        } else {
            resultJSON = response;
        }
        if(contrail.checkIfFunction(successCallback)) {
            refreshSuccessCallback(resultJSON);
        }
        requestInProgress = false;
    };

    failureHandler = function(response) {
        if(contrail.checkIfFunction(failureCallback)) {
            failureCallback(response);
        }
        requestInProgress = false;
    };

    fetchData = function() {
        contrail.ajaxHandler(ajaxConfig, initHandler, successHandler, failureHandler);
    };

    self.setRemoteAjaxConfig = function(config) {
        ajaxConfig = config;
    };

    self.refreshData = function() {
        if(!requestInProgress) {
            contrail.ajaxHandler(ajaxConfig, initHandler, refreshHandler, failureHandler);
        }
    };

    fetchData();

    return self;
};

function exportGridData2CSV(gridConfig, gridData) {
    var csvString = '',
        columnNameArray = [],
        columnExportArray = [];

    var gridColumns = gridConfig.columnHeader.columns;

    // Populate Header
    $.each(gridColumns, function(key, val){
        if(typeof val.exportConfig === 'undefined' || (typeof val.exportConfig.allow !== 'undefined' && val.exportConfig.allow == true)){
            columnNameArray.push(val.name);
            columnExportArray.push(val);
        }
    });
    csvString += columnNameArray.join(',') + '\r\n';

    $.each(gridData, function(key,val){
        var dataLineArray = [];
        $.each(columnExportArray, function(keyCol,valCol){
            var dataValue = String(val[valCol.field]);
            if(typeof valCol.exportConfig !== 'undefined' && typeof valCol.exportConfig.advFormatter === 'function' && valCol.exportConfig.advFormatter != false){
                dataValue = String(valCol.exportConfig.advFormatter(val));
            } else if((typeof valCol.formatter !== 'undefined') && (typeof valCol.exportConfig === 'undefined' || (typeof valCol.exportConfig.stdFormatter !== 'undefined' && valCol.exportConfig.stdFormatter != false))){
                dataValue = String(valCol.formatter(0,0,0,0,val));
            } else {
                if(typeof dataValue === 'object'){
                    dataValue = JSON.stringify(dataValue);
                }
            }
            dataValue = dataValue.replace(/"/g, '');
            dataLineArray.push('"' + dataValue + '"');
        });
        csvString += dataLineArray.join(',') + '\r\n';
    });

    var blob = new Blob([csvString], {type:'text/csv'});
    var blobUrl = window.URL.createObjectURL(blob);

    var a = document.createElement('a');
    a.href = blobUrl;
    a.target = '_blank';
    a.download = ((contrail.checkIfExist(gridConfig.header.title.text) && (gridConfig.header.title.text != '' || gridConfig.header.title.text != false)) ? gridConfig.header.title.text.toLowerCase().split(' ').join('-') : 'download') + '.csv';

    document.body.appendChild(a);
    a.click();

    setTimeout(function(){
        a.remove();
        window.URL.revokeObjectURL(blobUrl);
    }, 10000);

};

/*
 * Refresh View of the grid on resize of browser window
 */
$(window).on('resize',function(){
	$('.contrail-grid').each(function(){
		if(contrail.checkIfExist($(this).data('contrailGrid'))){
			$(this).data('contrailGrid').refreshView();
		}
	});
});
