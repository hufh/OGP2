if (typeof OpenGeoportal === 'undefined') {
	OpenGeoportal = {};
} else if (typeof OpenGeoportal !== "object") {
	throw new Error("OpenGeoportal already exists and is not an object");
}

if (typeof OpenGeoportal.Views === 'undefined') {
	OpenGeoportal.Views = {};
} else if (typeof OpenGeoportal.Views !== "object") {
	throw new Error("OpenGeoportal.Views already exists and is not an object");
}

/**
 * A Backbone View of the Cart Collection
 * 
 * @constructor
 */

/**
 * a backing model for setting download preferences
 */
OpenGeoportal.Models.DownloadPreferences = Backbone.Model.extend({
	defaults : {
		availableFormats : {
			vectorFormats : [ {
				formatType : "shp",
				formatDisplay : "ShapeFile (or native)"
			}, {
				formatType : "kmz",
				formatDisplay : "KMZ (KML)"
			} ],

			rasterFormats : [ {
				formatType : "geotiff",
				formatDisplay : "GeoTIFF (or native)"
			}, {
				formatType : "kmz",
				formatDisplay : "KMZ (KML)"
			} ]
		},
		vectorChoice : "",
		rasterChoice : "",
		isClipped : true
	}
});

OpenGeoportal.Models.DownloadRequest = OpenGeoportal.Models.QueueItem.extend({

	initialize : function() {
		this.set({
			requestUrl: "requestDownload",
			type : "layer",
			bbox : new OpenLayers.Bounds(-180,-90,180,90)
		
		});
		this.listenTo(this, "invalid", function(model, error) {

			if (error === "email") {
				var errMessage = "You must provide a valid email address.";
				jQuery("#emailValidationError").html(errMessage);
			} else {
				console.log("validation error for property: " + error);
			}
		});
	},
	validate : function(attrs, options) {
		var emailAddressProperty = "email";
		var emailAddress = attrs[emailAddressProperty];

		if (emailAddress !== null
				&& !OpenGeoportal.Utility.checkAddress(emailAddress)) {
			return emailAddressProperty;
		}

	}
});

OpenGeoportal.Views.Download = OpenGeoportal.Views.CartActionView
		.extend({

			cartFilter : function(model) {
				// what values do we need to attempt a download?
				return this.isDownloadAvailable(model) && model.get("isChecked");
			},

			cartAction : function() {
				

				
				var sortedLayers = this.sortLayersByDownloadType();

				
				if (_.has(sortedLayers, "ogpServer")
						&& sortedLayers.ogpServer.length > 0) {
					// get user input and form a request to send to the ogp
					// server
					this.downloadRequest = new OpenGeoportal.Models.DownloadRequest();
					this.downloadRequest.set({
						layers : sortedLayers.ogpServer
					});

					this.preferences = new OpenGeoportal.Models.DownloadPreferences();
					var that = this;
					this.setPreferences().then(this.finalizeRequest,
							this.failHandler1).then(this.sendDownloadRequest,
							this.failHandler2);

				} else if (_.has(sortedLayers, "ogpClient")
						&& sortedLayers.ogpClient.length > 0) {
					// handle the downloads from the client
					this.clientSideDownload(sortedLayers.ogpClient);

				} else {
					throw new Error("No valid layers in the cart collection!");
				}

			},
			
			isDownloadAvailable : function(model) {
				var isAvailable = model.isPublic();

				// check permissions
				if (!isAvailable) {
					isAvailable = OpenGeoportal.ogp.appState.get("login").model
							.hasAccess(model);
				}

				// short-circuit for no permission
				if (isAvailable) {

					// check that an appropriate url is available
					isAvailable = OpenGeoportal.Utility.hasLocationValueIgnoreCase(model
							.get("Location"), this.downloadKeys);
				}

				return isAvailable;

			},
			
			failHandler1 : function() {
				alert("finalize request failed");
			},
			failHandler2 : function() {
				alert("sendDownloadRequest failed");
			},
			clientSideDownload : function(arrModels) {
				throw new Error("clientSideDownload needs to be implemented.");
				// you'll also have to specify which location elements indicate
				// a layer that should use client side download in
				// OpenGeoportal.Models.CartLayer:setDownloadAttributes
			},
			downloadKeys : [ "wfs", "wcs", "wms", "filedownload", "download" ],
			
			setDownloadAttributes : function(model) {
				// either a download type that can be handled by OGP backend or
				// something else, like an external link (fileDownload). Alternatively,
				// no download is available for the resource. Ultimately, to determine
				// if the download can be handled by the backend, a request should be
				// made to the backend.

				var locationObj = model.get("Location");
				var locationKey = "";
				var availableFormats = [];
				var downloadType = "ogpServer";

				/*
				 * if (OpenGeoportal.Utility.hasLocationValueIgnoreCase(locationObj, [
				 * "externalUrl" ])) { downloadType = "ogpClient"; } else {
				 */
				if (OpenGeoportal.Utility.hasLocationValueIgnoreCase(locationObj,
						[ "wfs" ])) {
					availableFormats.push("shapefile");
				}

				if (OpenGeoportal.Utility.hasLocationValueIgnoreCase(locationObj,
						[ "wms" ])) {
					availableFormats.push("kmz");
				}

				if (OpenGeoportal.Utility.hasLocationValueIgnoreCase(locationObj,
						[ "wcs" ])) {
					availableFormats.push("geotiff");
				}
				/* } */

				model.set({
					downloadType : downloadType,
					downloadFormats : availableFormats
				});

			},
			sortLayersByDownloadType : function() {
				// sort layers depending on whether the server or client will
				// handle the request
				var layers = this.getApplicableLayers();
				//assign attributes
				var that = this;
				_.each(layers, function(model){
					that.setDownloadAttributes(model);
				});
				
				var sortedLayers = {};
				_.each(layers, function(model) {
					var dlType = model.get("downloadType");
					if (!_.has(sortedLayers, dlType)) {
						sortedLayers[dlType] = [];
					}
					sortedLayers[dlType].push(model);

				});
				return sortedLayers;
			},

			/**
			 * set download preferences -- step 1
			 */
			getPreferencesSelectionContent : function() {
				var arrModels = this.downloadRequest.get("layers");
				var formats = this.preferences.get("availableFormats");
				var that = this;

				if (_.isEmpty(arrModels)) {
					return 'No layers have been selected.';
				}
				// this needs to be improved, but there's a few things to decide
				// first. For now, just do what we've been doing
				var showVectorControl = false;
				var showRasterControl = false;

				_.each(arrModels, function(model) {
					showVectorControl = showVectorControl || model.isVector();
					showRasterControl = showRasterControl || model.isRaster();
				});

				var html = "<span>Select format for:</span><br />";
				var vectorControlId = "vectorControl";
				var rasterControlId = "rasterControl";

				if (showVectorControl) {
					html += this.template.formatSelectionControl({
						controlId : vectorControlId,
						controlClass : "downloadSelect",
						controlLabel : "Vector files",
						formats : formats.vectorFormats
					});

					// set a default
					var defaultFormat = formats.vectorFormats[0].formatType;
					this.preferences.set({
						vectorChoice : defaultFormat
					});

					// update the preferences model when the ui element changes
					jQuery(document).on("change", "#" + vectorControlId,
							function() {
								var uiValue = jQuery(this).val();
								that.preferences.set({
									vectorChoice : uiValue
								});

							});
				}

				if (showRasterControl) {
					html += this.template.formatSelectionControl({
						controlId : rasterControlId,
						controlClass : "downloadSelect",
						controlLabel : "Raster files",
						formats : formats.rasterFormats
					});

					// set a default
					var defaultFormat = formats.rasterFormats[0].formatType;
					this.preferences.set({
						rasterChoice : defaultFormat
					});
					// update the preferences model when the ui element changes
					jQuery(document).on("change", "#" + rasterControlId,
							function() {
								var uiValue = jQuery(this).val();
								this.preferences.set({
									rasterChoice : uiValue
								});

							});
				}

				if (html.length === 0) {
					// there are models that register as being downloadable, but
					// are neither vector nor raster
					html = "The selected layers have an invalid data type and can not be downloaded.";

				} else {
					// create the clip control
					html += this.template.clipControl({
						id : "downloadClipControl",
						isClipped : this.preferences.get("isClipped")
					});

					// update the preferences model when the ui element changes

					jQuery(document).on("change", "#downloadClipControl",
							function() {
								this.preferences.set({
									isClipped : jQuery(this).is(":checked")
								});

							});
				}

				return html;
			},

			setPreferences : function() {
				var setPreferencesDeferred = jQuery.Deferred();
				var dialogContent = this.getPreferencesSelectionContent();

				var dialogDonePromise = this
						.openPreferencesDialog(dialogContent);

				var that = this;
				// clicking the continue button resolves the dialogPromise
				dialogDonePromise.done(function() {
					// now that we're done with this dialog, update the model
					// with user specified preferences and resolve the
					// setPreferences deferred obj
					try {
						that.updateModelsWithPreferences();
						setPreferencesDeferred.resolveWith(that);
					} catch (e) {
						setPreferencesDeferred.rejectWith(that);
					}
				});

				return setPreferencesDeferred.promise();

			},

			openPreferencesDialog : function(dialogContent) {
				var deferred = jQuery.Deferred();
				var params = {
					zIndex : 3000,
					autoOpen : false,
					minHeight : '30px',
					width : 300,
					title : "Download Settings",
					resizable : false,
					modal : true,
					show : "fade",
					hide : "fade"
				};

				var dialogId = "downloadSettingsDialog";
				if (jQuery('#' + dialogId).length === 0) {
					var downloadDiv = this.template.genericDialogShell({
						id : dialogId
					});
					jQuery('#dialogs').append(downloadDiv);
				}
				var dialog$ = jQuery("#" + dialogId);
				dialog$.html(dialogContent);

				dialog$.dialog(params);
				dialog$.dialog("option", "disabled", false);

				var buttons;
				var cancelFunction = function() {
					jQuery(this).dialog('close');
					jQuery("#optionDetails").html("");
					jQuery(".downloadSelection, .downloadUnselection")
							.removeClass(
									"downloadSelection downloadUnselection");
					deferred.reject();
				};

				if (this.downloadRequest.get("layers").length === 0) {
					buttons = {
						Cancel : cancelFunction
					};
				} else {
					buttons = {
						Cancel : cancelFunction,
						Continue : function() {
							// update the models with the selected formats,
							// then resolve the promise returned by this dialog
							// function
							jQuery(this).dialog('close');
							deferred.resolve();
						}

					};
				}

				dialog$.dialog("option", "buttons", buttons);
				dialog$.dialog('open');

				return deferred.promise();
			},

			updateModelsWithPreferences : function() {
				var vectorChoice = "";
				if (this.preferences.has("vectorChoice")) {
					vectorChoice = this.preferences.get("vectorChoice");
				}

				var rasterChoice = "";
				if (this.preferences.has("rasterChoice")) {
					rasterChoice = this.preferences.get("rasterChoice");
				}

				var arrLayers = this.downloadRequest.get("layers");
				_.each(arrLayers, function(model) {
					if (model.isVector()) {
						// set the request format for the layer to the vector
						// value
						model.set({
							requestedFormat : vectorChoice
						});
					} else if (model.isRaster()) {
						// set the request format for the layer to the raster
						// value
						model.set({
							requestedFormat : rasterChoice
						});
					}
				});

				// set the bounds on the request object if "clipped" is checked
				if (this.preferences.get("isClipped")) {
					// set bounds in the downloadRequest model
					var extent = OpenGeoportal.ogp.map.getGeodeticExtent();
					this.downloadRequest.set({
						bbox : extent
					});
				}
				//console.log("models updated with preferences");
			},

			/**
			 * Continue download -- step 2
			 */

			finalizeRequest : function() {
				//console.log("starting finalize request");
				var finalizeRequestDeferred = jQuery.Deferred();
				var dialogDonePromise = this.openFinalizeRequestDialog();

				var that = this;
				// clicking the continue button resolves the dialogPromise
				dialogDonePromise.done(function() {
					// now that we're done with this dialog, update the model
					// with user specified preferences and resolve the
					// setPreferences deferred obj
					try {
						that.updateRequestFromFinalize();
						finalizeRequestDeferred.resolveWith(that, arguments);
					} catch (e) {
						finalizeRequestDeferred.rejectWith(that, arguments);
					}

				});

				return finalizeRequestDeferred.promise();
			},

			shouldUseHGLOpenDelivery : function(model, format) {
				var bool1 = model.get("Institution").toLowerCase() === "harvard";
				var bool2 = model.isRaster();
				var bool3 = OpenGeoportal.Utility.arrayContainsIgnoreCase(["geotiff"], model.get("requestedFormat"));
				return bool1 && bool2 && bool3;
			},
			/* emailKeys : [ "emailUrl" ], */
			requiresEmailAddress : function(model, format) {
				/*
				 * var useEmail = OpenGeoportal.Utility
				 * .hasLocationValueIgnoreCase( model.get("Location"),
				 * this.emailKeys);
				 */
				// there should be a more generalized way to do this, rather
				// than specifying "Harvard"
				// "download": "http://hgl.harvard.edu:8080/HGL/HGLOpenDelivery"
				// unfortunately, Harvard records don't always specify
				// HGLOpenDelivery. until we can fix this, this will have to be
				// a one-off
				return this.shouldUseHGLOpenDelivery(model, format);
			},

			getEmailAddressElement : function() {
				var arrModels = this.downloadRequest.get("layers");

				var template = "";
				var that = this;
				var required = false;
				_.each(arrModels, function(model) {
					var format = model.get("requestedFormat");
					var currentRequired = that.requiresEmailAddress(model, format);
					required = required || currentRequired;
					model.set({requiresEmail: currentRequired});
				});

				if (required) {

					template = this.template.requireEmailAddress();
				}

				return template;
			},

			getLayerDownloadNotice : function() {
				var arrModels = this.downloadRequest.get("layers");

				var template = "";

				var downloadCount = 0;
				var emailCount = 0;
				var that = this;
				_.each(arrModels, function(model) {
					var format = model.get("requestedFormat");
					if (that.requiresEmailAddress(model, format)) {
						emailCount++;
					} else {
						downloadCount++;
					}
				});

				var total = emailCount + downloadCount;
				var plural = (total > 1);

				template = this.template.layerDownloadNotice({
					emailCount : emailCount,
					downloadCount : downloadCount,
					total : total,
					plural : plural
				});

				return template;
			},

			openFinalizeRequestDialog : function() {
				var deferred = jQuery.Deferred();

				var dialogId = "downloadFinalizeDialog";
				if (jQuery('#' + dialogId).length === 0) {
					var downloadDiv = this.template.genericDialogShell({
						id : dialogId
					});
					jQuery('#dialogs').append(downloadDiv);
				}

				var dialogContent = this.getFinalizeRequestDialogContent();
				var dialog$ = jQuery("#" + dialogId);
				dialog$.html(dialogContent);

				var that = this;
				var cancelFunction = function() {
					jQuery(this).dialog('close');
					jQuery("#optionDetails").html("");
					jQuery(".downloadSelection, .downloadUnselection")
							.removeClass(
									"downloadSelection downloadUnselection");
					deferred.rejectWith(that);
				};

				var buttons = {
					Cancel : cancelFunction,
					Download : function() {
						// update the models with the selected formats,
						// then resolve the promise returned by this dialog
						// function
						deferred.resolveWith(that, [ dialog$ ]);

					}

				};

				var params = {
					title : "Download",
					width : 350,
					show : "fade",
					hide : "fade",
					modal : true,
					buttons : buttons
				};

				dialog$.dialog(params);

				dialog$.dialog('open');

				// set the focus
				var email$ = jQuery("#emailAddress");
				if (email$.length > 0) {
					email$.focus();
				} else {
					dialog$.siblings(".ui-dialog-buttonpane").find(
							".ui-dialog-buttonset > button").last().focus();
				}

				// make sure this dialog closes if there is an error
				deferred.fail(function() {

					dialog$.dialog("close");
				});

				return deferred.promise();
			},

			showTransferAnimation : function(dialog$) {
				// when the download button is pushed, run an animation, close
				// the dialog
				var options = {
					to : "#requestTickerContainer",
					className : "ui-effects-transfer"
				};
				dialog$.parent().effect("transfer", options, 500, function() {
					dialog$.dialog('close');
				});

			},
			getFinalizeRequestDialogContent : function() {
				var downloadContinue = this.getLayerDownloadNotice();
				downloadContinue += this.getEmailAddressElement();

				return downloadContinue;
			},
			updateRequestFromFinalize : function() {

				// validate the email address
				var email$ = jQuery("#emailAddress");
				if (email$.length > 0) {
					var emailAddress = email$.val().trim();
					this.downloadRequest.set({
						email : emailAddress
					}, {
						validate : true
					});
				}

			},

			sendDownloadRequest : function($dialog) {
				//split into 2 requests if there are email requests
				var layers = this.downloadRequest.get("layers");
				var emailLayers = [];
				var dlLayers = [];
				var requestQ = OpenGeoportal.ogp.appState.get("requestQueue");
				
				_.each(layers, function(model){
					if (model.has("requiresEmail") && model.get("requiresEmail")){
						emailLayers.push(model);
					} else {
						dlLayers.push(model);
					}
				});
				
				
				if (emailLayers.length > 0){
					
					var emailRequest = this.downloadRequest.clone();
					emailRequest.set({layers: emailLayers});

					requestQ.addToQueue(emailRequest);
					
					if (dlLayers.length > 0){
						this.downloadRequest.set({layers: dlLayers});
						//console.log(this.downloadRequest);
						requestQ.addToQueue(this.downloadRequest);

					}
				} else {
					requestQ.addToQueue(this.downloadRequest);
				}
				
	
				this.showTransferAnimation($dialog);
				// where should this go?
				// jQuery(".downloadSelection,
				// .downloadUnselection").removeClass("downloadSelection
				// downloadUnselection");

			}

		});