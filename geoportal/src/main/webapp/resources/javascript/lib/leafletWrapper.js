/**
 *
 * This javascript module includes functions for dealing with Leaflet
 *
 * @authors Chris Barnett, Ben Hickson
 */

if (typeof OpenGeoportal === 'undefined') {
    OpenGeoportal = {};
} else if (typeof OpenGeoportal !== "object") {
    throw new Error("OpenGeoportal already exists and is not an object");
}

/**
 * LeafletWrapper constructor
 *
 * @constructor
 * @requires Leaflet
 *
 */
OpenGeoportal.LeafletWrapper = function() {
    var self = this;

    /**
     * initialization function for the map
     *
     * @param {string}
     *            containerDiv - the id of the div element that the map should
     *            be rendered to
     * @param {object}
     *            userOptions - object can be used to pass Leaflet options to
     *            the created Leaflet map
     *
     */
    this.init = function(mapDiv, initialZoom) {

        try {
            this.leafletMap = this.createMap(mapDiv, initialZoom);
        } catch (e) {
            console.log("problem creating leaflet map");
            console.log(e);
        }

        this.initBasemaps();
        this.previewLayerGroup = L.layerGroup().addTo(this.leafletMap);

        try {
            //this.registerMapEvents();
        } catch (e) {
            console.log("problem registering map events");
            console.log(e);
        }

    };

    /**
     * Create the controls for the map. Depends on "previewed" object.
     *
     * @requires OpenGeoportal.PreviewedLayers
     * @returns an array of controls to pass to the map
     */

    this.createLeafletControls = function() {
        var extentHistory = new L.HistoryControl({
           position: "topleft"
        });

/*        var zoomBox = L.control.zoomBox({
            modal:false,
            position:"topleft"
        });*/

        var scaleBar = L.control.scale({
            position:"bottomright"
        });

        var mouseCoords = L.control.coordinates({
            position:"bottomright",
            decimals:4,
            enableUserInput:false,
            decimalSeparator:".",
            useLatLongOrder:false,
            labelTemplateLng:"Longitude: {x}",
            labelTemplateLat:"Latitude: {y}"
        });

/*        var loadingControl = L.Control.loading({
            separate: true
        });*/

        var mapControls = [scaleBar];

        return mapControls;
    };


    /**
     * Instantiate the actual Leaflet map object, sets parameters, size,
     * initial view and active area. Add controls
     *
     * @param {object}
     *            userOptions - options to pass through to the Leaflet Map
     *            object
     */
    this.createMap = function(mapDiv, initialZoom, userOptions) {
        userOptions = userOptions || {};
        initialZoom = initialZoom || 1;

        // set default Leaflet map options
        this.controls = this.createLeafletControls();

        var options = {
            maxZoom: 18
        };

        // merge default options and user specified options into 'options'--not
        // recursive
        $.extend(userOptions, options);

        var map = L.map(mapDiv, options);

        // add controls to map
        _.each(this.controls, function(c){
            c.addTo(map);
        });

/*        map.on('load', function() {
            $(document).trigger("mapReady");
        } );*/


        // set the visible area of the map to be the active area
        // creates a div with class viewport
        map.setActiveArea('viewport');


        //OpenGeoportal.ogp.structure.panelView.setAlsoMoves();
        map.setView(new L.LatLng(0,0), initialZoom);


        return map;
    };

    /**
     * Initialize the Basemaps collection, set the initial basemap
     */

    this.initBasemaps = function() {
        this.basemaps = this.createBasemaps();

        this.basemaps.addTo(this.leafletMap);
    };


    /***************************************************************************
     * basemap handling
     **************************************************************************/

    this.createBasemaps = function() {
        var that = this;

        // values are injected to OpenGeoportal.Config.BasemapsBootstrap on page load from ogp_config.json
        var basemaps = OpenGeoportal.Config.BasemapsBootstrap;

        var map_map = {};
        _.each(basemaps, function(map){
            var params = {};
            if (_.has(map, "attribution")){
                params.attribution = map.attribution;
            }

            if (_.has(map, "id")){
                params.id = map.id;
            }
            var layer = L.tileLayer(map.url, params);//.on('load', that.leafletMap.mapLoaded);
            map_map[map.displayName] = layer;

            // Set Default Basemap
            if (_.has(map, "default") && map["default"]){
                layer.addTo(that.leafletMap).setZIndex(50);
            }
        });

        // create an instance of the basemap collection
        return new L.control.layers(map_map);

    };


    /***************************************************************************
     * map actions and requests
     **************************************************************************/


    this.clamp = function(val, min, max){
        if (val > max) {
            val = max;
        }
        if (val < min) {
            val = min;
        }
        return val;
    };

    this.getSearchBounds = function(){
        var leafletBounds = this.leafletMap.getBounds();
        return {
            "minX": this.clamp(leafletBounds.getWest(), -180, 180),
            "maxX": this.clamp(leafletBounds.getEast(), -180, 180),
            "minY": this.clamp(leafletBounds.getSouth(), -90, 90),
            "maxY": this.clamp(leafletBounds.getNorth(), -90, 90)
        };

    };

    this.getLocationParamsFromClickEvent = function(e){
        console.log("click event");
        console.log(e);

        var pt = e.containerPoint;
        var latlng = e.latlng;

        return this.getLocationParams(pt, latlng);
    };

    this.getLocationParams = function(pt, latlng){
        var mapExtent = this.leafletMap.getBounds();

        var topLeftPoint = this.leafletMap.latLngToContainerPoint(mapExtent.getNorthWest());
        var bottomRightPoint = this.leafletMap.latLngToContainerPoint(mapExtent.getSouthEast());
        var pixelBounds = new L.Bounds(topLeftPoint, bottomRightPoint);
        return {
            coord: latlng.lat + ',' + latlng.lng,
            bbox: mapExtent.toBBoxString(),
            srs: "EPSG:4326",
            pixel: Math.round(pt.x) + ',' + Math.round(pt.y),
            size: pixelBounds.getSize().x + ',' + pixelBounds.getSize().y
        };
    };
    // add layers to map
    this.hideLayerBBox = function(layers) {
        this.bBoxes.clearLayers();
        //THIS MAY NOT BE NEEDED?..
        $(".corner").hide();
    };

    /**
     * show a bounding box on the map.
     * @param ogpBounds 	obj with 'minX', 'maxX', 'minY', 'maxY'
     */
    this.showLayerBBox = function(ogpBounds) {

        // add a layer with a vector representing the selected feature bounding box

        if (typeof this.bBoxes !== "undefined") {
            var layers = this.bBoxes.getLayers();
            this.hideLayerBBox(layers);
        } else {
            this.bBoxes = L.layerGroup();
            this.bBoxes.addTo(this.leafletMap);
        }

        var bottomLeft = L.latLng([ogpBounds.minY, ogpBounds.minX]);
        var topRight   = L.latLng([ogpBounds.maxY, ogpBounds.maxX]);

        /* if pixel distance b/w topRight and bottomLeft falls below a certain threshold,
        * add a marker(fixed pixel size) in the center, so the user can see where the layer is*/
        var blPixel = this.leafletMap.latLngToContainerPoint(bottomLeft);
        var trPixel = this.leafletMap.latLngToContainerPoint(topRight);

        //Good old Pythagoras...
        var pixelDistance = Math.sqrt(Math.pow((trPixel.x-blPixel.x),2) + Math.pow((trPixel.y-blPixel.y),2));

        var threshold = 10;
        var displayMarker = false;

        if (pixelDistance <= threshold){
            displayMarker = true;
        }

        var visExtent = this.leafletMap.getBounds();

        //LEAFLET HAS ISSUES HANDLING BOUNDING BOXES CROSSING THE DATELINE, HERE CREATE ONE THAT CROSSES DATELINE (e.g. coordinate at more than 180);
        if (bottomLeft.lng > topRight.lng) {
            var visLeft = visExtent.getSouthWest().lng;
            //CONVERT THE GIVEN LAYER COORDINATES TO THE ABSOLUTE MAP COORDINATES (LEAFLET MAY SEE Lng 170 as -190 for a particular area)
            var diff = 180 - bottomLeft.lng;
            var calcLng = -180 - diff;
            bottomLeft.lng = calcLng;
            //CALCULATED MIDDLE OF GIVEN LAYER BBOX
            var middleX = (topRight.lng + bottomLeft.lng) / 2;
            //CHECK WHERE TO SHOW BBOX
            if (visLeft.lng > middleX) {
                bottomLeft.lng = bottomLeft.lng + 2*180;
                topRight.lng = topRight.lng + 2*180;
            }
        }

        var bounds = L.latLngBounds(bottomLeft, topRight);
        var bBox = null;
        if (displayMarker){
            var center = bounds.getCenter();
            bBox = L.circleMarker(center, { weight: 4, color: "#103b56", fillOpacity:0.15, className: "bBox" });

        } else {
            bBox = L.rectangle(bounds,{ weight: 4, color: "#103b56", fillOpacity:0.15, className: "bBox" });

        }

        var time = 500;
        bBox.on("add", function(event){
            $(".bBox").animate({opacity:1},time);
        });
        bBox.addTo(this.bBoxes);

        // do a comparison with current map extent
        var mapTop = visExtent.getNorthEast().lat;
        if (mapTop > 85.05) {
            mapTop = 85.05;
        }
        var mapBottom = visExtent.getSouthWest().lat;
        if (mapBottom < -85.05) {
            mapBottom = -85.05;
        }
        var mapLeft = visExtent.getSouthWest().lng;
        if (mapLeft < -180) {
            mapLeft = -180;
        }
        var mapRight = visExtent.getNorthEast().lng;
        if (mapRight >= 180) {
            mapRight = 179.9999;
        }

        var layerTop = topRight.lat;
        var layerBottom = bottomLeft.lat;
        var layerLeft = bottomLeft.lng;
        var layerRight = topRight.lng;


        var showEWArrows = true;

        if (layerLeft < mapLeft
            || layerRight > mapRight
            || layerTop > mapTop
            || layerBottom < mapBottom) {

            if (layerTop < mapTop && layerBottom > mapBottom) {
                if (showEWArrows) {
                    if (layerRight > mapRight) {
                        // console.log("ne + se");
                        this.showCorners([ "ne", "se" ]);
                    }

                    if (layerLeft < mapLeft) {
                        // console.log("sw + nw");
                        this.showCorners([ "sw", "nw" ]);
                    }
                }
            } else if (layerRight < mapRight && layerLeft > mapLeft) {
                if (layerTop > mapTop) {
                    //console.log("ne + nw");
                    this.showCorners([ "ne", "nw" ]);
                }

                if (layerBottom < mapBottom) {
                    //console.log("se + sw");
                    this.showCorners([ "se", "sw" ]);
                }

            } else {
                //console.log("corners only");
                if (layerTop > mapTop && layerRight > mapRight) {
                    this.showCorners([ "ne" ]);
                }

                if (layerBottom < mapBottom && layerRight > mapRight) {
                    this.showCorners([ "se" ]);
                }

                if (layerTop > mapTop && layerLeft < mapLeft) {
                    this.showCorners([ "nw" ]);
                }

                if (layerBottom < mapBottom && layerLeft < mapLeft) {
                    this.showCorners([ "sw" ]);
                }

            }

        }

    };

    this.showCorners = function(corners) {
        var cornerIds = {
            ne : "neCorner",
            nw : "nwCorner",
            sw : "swCorner",
            se : "seCorner"
        };

        for ( var i in corners) {
            if(corners.hasOwnProperty(i)) {
                jQuery("#" + cornerIds[corners[i]]).show();
            }

        }
    };


    /***************************************************************************
     * style (SLD) handling
     **************************************************************************/

    this.setStyle = function(layerModel) {

        var dataType = layerModel.get("DataType").toLowerCase();

        var userSLD = {};
        var layerId = layerModel.get("LayerId");

        var wmsName = layerModel.get("qualifiedName");
        var userColor = layerModel.get("color");
        var userWidth = layerModel.get("graphicWidth");
        userSLD.layerName = wmsName;
        userSLD.layerType = dataType;
        userSLD.fillColor = userColor;
        userSLD.strokeWidth = userWidth;

        if (dataType == "polygon") {
            userSLD.strokeColor = this.getBorderColor(userColor);
            userSLD.strokeWidth -= 1
        } else if (dataType == "point") {
            userSLD.strokeColor = "#000";
        } else if (dataType == "line") {
            userSLD.strokeColor = userColor;
        } else {
            console.log("Unknown Data Type");
        }
        var newSLD = {
            layers : wmsName,
            sld_body : this.createSLDFromParams(userSLD)
        };
        layerModel.set({
            sld: userSLD
        });

        try {
            var layer = this.getLayerByOGPId(layerId);
            layer.setParams(newSLD);
        } catch (e) {
            console.log("not yet in previewLayerGroup");
            return newSLD;
        }
    };

    this.getBorderColor = function(fillColor) {
        // calculate an appropriate border color
        var borderColor = {};
        borderColor.red = fillColor.slice(1, 3);
        borderColor.green = fillColor.slice(3, 5);
        borderColor.blue = fillColor.slice(5);
        for ( var color in borderColor) {
            // make the border color darker than the fill
            var tempColor = parseInt(borderColor[color], 16) - parseInt(0x50);
            if (tempColor < 0) {
                // so we don't get any negative values for color
                tempColor = "00";
            } else {
                // convert to hex
                tempColor = tempColor.toString(16);
            }
            // check length; the string should be 2 characters
            if (tempColor.length == 2) {
                borderColor[color] = tempColor;
            } else if (tempColor.length == 1) {
                borderColor[color] = '0' + tempColor;
            } else {
                borderColor[color] = '00';
            }
        }
        // reassemble the color string
        return "#" + borderColor.red + borderColor.green + borderColor.blue;
    };

    this.createSLDFromParams = function(arrUserParams) {
        var sldBody  = OpenGeoportal.Utility.createSLD(arrUserParams);

        return sldBody;
    };

    /***************************************************************************
     * map preview functions
     **************************************************************************/

    this.getLayerByOGPId = function (layerId) {
        var group = this.previewLayerGroup;
        var layerMatch = null;
        group.eachLayer(function (layer) {

            if (layer.options.id === layerId) {
                layerMatch = layer;
                return;
            }
        });
        if (layerMatch === null){
            console.log("no layer matching id " + layerId + " found");
        }
        return layerMatch;
    };

    this.hideLayer = function(layerId) {
        var layer = this.getLayerByOGPId(layerId);
        try {
            var container = layer.getContainer();
        } catch (err) {
            var container  = this.leafletMap.getPane(layerId);
        }
        container.style.display ='none';
    };

    this.showLayer = function(layerId) {
        var layer = this.getLayerByOGPId(layerId);
        var container;
        try {
            container = layer.getContainer();
        } catch (err) {
            container  = this.leafletMap.getPane(layerId);
        }
        container.style.display = '';
    };

    this.setOpacity = function(layerId, opacity){
        var layer = this.getLayerByOGPId(layerId);
        try {
            layer.setOpacity(opacity * 0.01);
        } catch (err) {
            // setOpacity won't work for Arc layers (json)
            var pane = this.leafletMap.getPane(layerId);
            pane.style.opacity = opacity * 0.01;
        }

    };

    this.setZ = function(layerId, zIndex){
        var layer = this.getLayerByOGPId(layerId);
        try {
            layer.setZIndex(zIndex);
        } catch (err) {
            var pane = this.leafletMap.getPane(layerId);
            pane.style.zIndex = zIndex;
        }
    };


    this.addMapBBox = function(layerModel) {


        var bottomLeft = L.latLng([layerModel.get("MinY"), layerModel.get("MinX")]);
        var topRight   = L.latLng([layerModel.get("MaxY"), layerModel.get("MaxX")]);

        var visExtent = this.leafletMap.getBounds();//this.getVisibleExtent();

        //LEAFLET HAS ISSUES HANDLING BOXES CROSSING THE DATELINE, HERE CREATE ONE THAT CROSSES DATELINE (e.g. coordinate at more than 180);
        if (bottomLeft.lng > topRight.lng) {
            var visLeft = visExtent.getSouthWest().lng;
            //CONVERT THE GIVEN LAYER COORDINATES TO THE ABSOLUTE MAP COORDINATES (LEAFLET MAY SEE Lng 170 as -190 for a particular area)
            var diff = 180 - bottomLeft.lng;
            var calcLng = -180 - diff;
            bottomLeft.lng = calcLng;
            //CALCULATED MIDDLE OF GIVEN LAYER BBOX
            var middleX = (topRight.lng + bottomLeft.lng) / 2
            //CHECK WHERE TO SHOW BBOX
            if (visLeft.lng > middleX) {
                bottomLeft.lng = bottomLeft.lng + 2*180;
                topRight.lng = topRight.lng + 2*180;
            }
        }

        var bounds = L.latLngBounds(bottomLeft, topRight);

        var layerBox = L.rectangle(bounds, {
            weight: 2,
            color: "green",
            fillColor: "green",
            fillOpacity:0.05
        });

        this.registerLayer(layerModel, layerBox);

    };



    this.getLayerName = function(layerModel, url) {
        var layerName = layerModel.get("Name");
        var wmsNamespace = layerModel.get("WorkspaceName");
        //if there is a workspace name listed and the layername doesn't already contain one, prepend it
        var qualifiedName = layerName;
        if ((wmsNamespace.length > 0) && (layerName.indexOf(":") == -1)) {
            qualifiedName = wmsNamespace + ":" + layerName;
        }

        layerModel.set({
            qualifiedName : qualifiedName
        });

        layerName = qualifiedName


        return layerName;
    };

    this.getMaxZ = function(){
        var that = this;
        var arrZ = [];
        this.previewLayerGroup.eachLayer(function(layer) {
            var zIndex = layer.options.zIndex;
            if (isNaN(zIndex)) {
                var pane = that.leafletMap.getPane(layer.options.id);
                zIndex = pane.style.zIndex;
                if (zIndex.length === 0) { zIndex = 400 }
            }
            arrZ.push(zIndex);
        });

        return _.max(arrZ);
    };

    this.getNextZ = function(){
        var maxZ = this.getMaxZ();
        if (isFinite(maxZ)) { maxZ += 1 } else { maxZ = 100 }
        return maxZ
    };

    this.getPreviewUrlArray = function(layerModel, useTilecache) {
        // is layer public or private? is this a request that can be handled by a tilecache?

        var urlArraySize = 1;
        var urlArray = [];
        var populateUrlArray = function(addressArray) {
            if (addressArray.length === 1) {
                for (var i = 0; i < urlArraySize; i++) {
                    urlArray[i] = addressArray[0];
                }
            } else {
                urlArray = addressArray;
            }

        };

        // check for a proxy here
        var proxy = OpenGeoportal.Config.getWMSProxy(layerModel
            .get("Institution"), layerModel.get("Access"));
        if (proxy) {
            layerModel.set({
                wmsProxy : proxy
            });
        }

        if (layerModel.has("wmsProxy")) {
            populateUrlArray([ layerModel.get("wmsProxy") ]);
        } else if ((typeof layerModel.get("Location").tilecache !== "undefined")
            && useTilecache) {
            populateUrlArray(layerModel.get("Location").tilecache);
        } else {
            populateUrlArray(layerModel.get("Location").wms);
        }

        return urlArray;
    };

    this.layerExists = function(layerModel) {
        if (typeof layerModel.get("Location").wms !== "undefined") {
            this.setWmsLayerInfo(layerModel);
        } else {
            // assume it exists
            $(document).trigger(layerModel.get("LayerId") + 'Exists');
        }
    };

    this.setWmsLayerInfo = function(model) {
        var queryData = {
            ogpid : model.get("LayerId")
        };
        var ajaxParams = {
            type : "GET",
            url : 'info/wmsInfo', // don't throw a 500 error for layers with
            // service start. otherwise, throw the
            // error, or note in 200 response
            data : queryData,
            dataType : 'json',
            success : function(data) {
                // {"owsProtocol":"WMS","infoMap":{"owsUrl":"http://geoserver01.uit.tufts.edu/wfs/WfsDispatcher?","owsType":"WFS","qualifiedName":"sde:GISPORTAL.GISOWNER01.WORLDBOUNDARIES95"},"owsDescribeInfo":null}
                // jQuery("body").trigger(model.get("qualifiedName") +
                // 'Exists');
                model.set({
                    qualifiedName : data.infoMap.qualifiedName
                });
                // should we also set a wfs or wcs if found?...if the dataType
                // is unknown, it should be updated to vector or raster
            },
            error : function() {

                // let the user know the layer is not previewable
                // remove the layer from preview panel
                // throw new Error("layer could not be added");
                //console.log("got an error trying to get layer info");
            },
            complete : function() {
                //jQuery("body").trigger(model.get("LayerId") + 'Exists');

                //jQuery(document).trigger({type: "hideLoadIndicator", loadType: "getWmsInfo", layerId: model.get("LayerId")});
            }
        };
        jQuery.ajax(ajaxParams);
        //for now, don't wait for wmsinfo response to start loading the layer; perhaps only call if there is an error
        jQuery("body").trigger(model.get("LayerId") + 'Exists');

    };

    this.addWMSLayer = function(layerModel) {

        var layerId = layerModel.get("LayerId");

        var opacitySetting = layerModel.get("opacity");

        var matchingLayer = this.getLayerByOGPId(layerId);

        var zIndex = this.getNextZ();
        if (matchingLayer !== null) {
            layerModel.set({zIndex: zIndex});
            this.showLayer(layerId);
            matchingLayer.opacity = opacitySetting * .01;
            return;
        }

        var wmsArray = this.getPreviewUrlArray(layerModel, true);

        var that = this;
        // we do a check to see if the layer exists before we add it
        $("body").bind(layerModel.get("LayerId") + 'Exists',
            function() {
                var layerName = that.getLayerName(layerModel, wmsArray[0]);
                var newLayer = L.tileLayer.wms(wmsArray[0], {
                    layers: layerName,
                    format: "image/png",
                    version:'1.1.0',
                    tiled:false,
                    transparent:true,
                    attribution:"",
                    opacity:opacitySetting*0.01,
                    id: layerId,
                    zIndex: zIndex,
                    identify: false
                });

                newLayer.on('load', function() {
                    if (!newLayer.getContainer().classList.contains('tiles-loaded')) {
                        newLayer.getContainer().className += ' tiles-loaded';
                    }
                });

                var defaultColor = layerModel.get("color");
                if (layerModel.isVector() && defaultColor !== "#003300") {
                    var style = that.setStyle(layerModel);
                    newLayer.setParams(style);
                }

                that.registerLayer(layerModel, newLayer);

                //For some reason the loading indicator won't fire on initial layer load without this....
                that.leafletMap.fireEvent('dataloading', {layer: newLayer});

                try {
                    layerModel.set({zIndex: zIndex});
                } catch (e){
                    console.log("failed!");
                    console.log(e);
                }
            });
        this.layerExists(layerModel);
    };

    this.addArcGISRestLayer = function(layerModel) {

        var layerId = layerModel.get("LayerId");

        var matchingLayer = this.getLayerByOGPId(layerId);

        if (matchingLayer !== null) {
            var zIndex = this.getNextZ();
            layerModel.set({zIndex: zIndex});
            this.showLayer(layerId);
            return;
        }

        this.createPane(layerId);

        var layerUrl = layerModel.get("Location").ArcGISRest + "/";
        layerUrl += layerModel.get("Location").layerId;

        var dataType = layerModel.get("DataType");
        var newLayer = null;
        if (dataType == "Point" || dataType == "point" ) {
            newLayer = new L.esri.featureLayer({
                url: layerUrl,
                id: layerId,
                pointToLayer: function (geojson, latlng) {
                    return L.circleMarker(latlng, {
                        pane: layerId,
                        weight: 1,
                        radius: 4,
                        color: 'black',
                        fillColor: 'red',
                        fillOpacity: 0.8,
                        className: layerId
                    });
                }
            })
        } else if (dataType == "Line" || dataType == "line" ) {
            newLayer = new L.esri.featureLayer({
                url: layerUrl,
                id: layerId,
                pane: layerId,
                className: layerId,
                style: function (feature) {
                    return { color: 'blue', weight: 2 }
                }
            });
        } else if (dataType == "Polygon" || dataType == "polygon" ) {
            newLayer = new L.esri.featureLayer({
                url: layerUrl,
                id: layerId,
                pane: layerId,
                className: layerId,
                style: function (feature) {
                    return { color:'white', weight: 2, fillOpacity: 0.8 }
                }
            });
        } else {
            alert("Unknown data type. Unable to display layer");
            return;
        }

        $("."+layerId).css('z-index','400');

        var that = this;

        // we do a cursory check to see if the layer exists before we add it
        jQuery("body").bind(layerModel.get("LayerId") + 'Exists', function() {
            that.registerLayer(layerModel, newLayer);
            //For some reason the loading indicator won't fire on initial layer load without this....
            that.fireEvent('dataloading', {layer: newLayer});
        });

        this.layerExists(layerModel);
    };

    this.registerLayer = function(layerModel, leafletLayer){
        this.previewLayerGroup.addLayer(leafletLayer);
    };


    this.previewBrowseGraphic = function(layerModel) {
        var dialogHtml = '<img src="'
            + layerModel.get("Location").browseGraphic + '"/>';
        if (typeof jQuery('#browseGraphic')[0] == 'undefined') {
            var infoDiv = '<div id="browseGraphic" class="dialog">'
                + dialogHtml + '</div>';
            jQuery("body").append(infoDiv);
            jQuery("#browseGraphic").dialog({
                zIndex : 2999,
                title : "Thumbnail Preview",
                width : 'auto',
                height : "auto",
                resizable : false,
                autoOpen : false
            });
            jQuery("#browseGraphic").dialog('open');
        } else {
            jQuery("#browseGraphic").html(dialogHtml);
            jQuery("#browseGraphic").dialog('open');
        }
    };

    this.closeBrowseGraphic = function(layerId) {
        jQuery("#browseGraphic").dialog('close');
        jQuery("#browseGraphic").html("");
    };

    // a place to store references to external windows and associated data
    this.externalPreviewWindows = new OpenGeoportal.ExternalPreviewWindows();

    this.openImageCollectionUnGeoReferenced = function(model) {
        // this model has attributes to facilitate preview of ImageCollection
        // UnGeoreferenced layers
        var newModel = new OpenGeoportal.Models.ImageCollectionUnGeoreferenced(
            model.attributes);
        // adding the model opens the external window
        this.externalPreviewWindows.add(newModel);
    };

    this.closeImageCollectionUnGeoReferenced = function(layerId) {
        var model = this.externalPreviewWindows.findWhere({
            LayerId : layerId
        });
        this.externalPreviewWindows.remove(model);
    };

    /**
     *
     * @param {string}
     *            previewType a key that should match up with a "type" property
     * @param {string}
     *            functionType either "onHandler" for the function that turns on
     *            a layer preview or "offHandler" for the function that turns
     *            off a layer preview
     * @returns {Function} a function that turns on or off a layer depending on
     *          passed type
     */
    this.getPreviewMethod = function(previewType, functionType) {
        var previewMethods = [ {
            type : "imagecollection",
            onHandler : this.openImageCollectionUnGeoReferenced,
            offHandler : this.closeImageCollectionUnGeoReferenced
        }, {
            type : "tilecache",
            onHandler : this.addWMSLayer,
            offHandler : this.hideLayer
        }, {
            type : "wms",
            onHandler : this.addWMSLayer,
            offHandler : this.hideLayer
        }, {
            type : "arcgisrest",
            onHandler : this.addArcGISRestLayer,
            offHandler : this.hideLayer
        }, {
            type : "browsegraphic",
            onHandler : this.previewBrowseGraphic,
            offHandler : this.closeBrowseGraphic
        }, {
            type : "default",
            onHandler : this.addMapBBox,
            offHandler : this.hideLayer
        } ];

        for ( var i in previewMethods) {
            if (previewMethods[i].type === previewType) {
                return previewMethods[i][functionType];
            }
        }
        return previewMethods["default"][functionType];
    };

    this.previewLayerOn = function(layerModel) {
        // find preview method
        try {
            var type = layerModel.get("previewType");
            var previewOnFunction = this.getPreviewMethod(type, "onHandler");
            try {
                previewOnFunction.call(this, layerModel);
            } catch (e) {
                console.log(e);
                throw new Error("error in preview on handler.");
            }

            //analytics.track("Layer Previewed", layerModel.get("Institution"), layerId);
        } catch (err) {
            // if there's a problem, set preview to off, give the user a notice
            console.log("error in layer on");
            console.log(err);
            layerModel.set({
                preview : "off"
            });
            throw new Error(
                'Unable to Preview layer "'
                + layerModel.get("LayerDisplayName") + '"');
        }

    };

    this.previewLayerOff = function(layerModel) {
        // find preview off method

        var type = layerModel.get("previewType");
        var previewOffFunction = this.getPreviewMethod(type, "offHandler");
        try {
            previewOffFunction.call(this, layerModel.get("LayerId"));

        } catch (err) {
            //console.log("error in layer off");
            //throw new OpenGeoportal.ErrorObject(err,'Unable to remove Previewed layer "'	+ previewModel.get("LayerDisplayName") + '"');
        }
    };

};
