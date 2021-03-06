define(["modules/jquery-mozu", 'modules/api', "underscore", "hyprlive", "modules/backbone-mozu", "hyprlivecontext", 'modules/mozu-grid/mozugrid-view', 'modules/mozu-grid/mozugrid-pagedCollection', "modules/views-paging", "modules/models-product", "modules/models-wishlist", "modules/search-autocomplete", "modules/models-cart", "modules/product-picker/product-picker-view", "modules/backbone-pane-switcher", "modules/product-picker/product-modal-view", "modules/mozu-utilities", "modules/message-handler"], function ($, api, _, Hypr, Backbone, HyprLiveContext, MozuGrid, MozuGridCollection, PagingViews, ProductModels, WishlistModels, SearchAutoComplete, CartModels, ProductPicker, PaneSwitcher, ProductModalViews, MozuUtilities, MessageHandler) {
    var ALL_LISTS_FILTER = "";
    var USER_LISTS_FILTER = "userId eq " + require.mozuData('user').userId;
    var WishlistModel = WishlistModels.Wishlist.extend({
        handlesMessages: true,
        defaults: {
            'pickerItemQuantity': 1,
            'isProductSelected': false
        },
        deleteWishlist: function (id) {
            if (id) {
                return this.apiModel['delete']({ id: id });
            }
        },
        saveWishlist: function () {
            this.set('customerAccountId', require.mozuData('user').accountId);
            if (!this.get('name') || this.get('name') === " ") {
                this.set('name', 'New List - ' + Date.now());
            }
            if(!this.get('userId')) {
                this.set('userId', require.mozuData('user').userId);
            }
            this.set('customerAccountId', require.mozuData('user').accountId);

            if (this.get('id')) {
                this.syncApiModel();
                return this.apiModel.update();
            }
            return this.apiModel.create(this.model);
        },

        addWishlistItem: function (item, quantity) {
            var self = this;
            self.isLoading(true);
            if (!this.get('id')) {

                return this.saveWishlist().then(function () {
                    var payload = {
                            wishlistId: self.get('id'),
                            id: self.get('id'),
                            quantity: 1,
                            product: item
                    };
                    self.apiModel.addItemTo(payload, { silent: true }).then(function (data) {
                        //self.get('items').add(new WishlistModels.WishlistItem(data.data), { merge: true });
                        return self.apiGet();
                    }).ensure(function () {
                        self.isLoading(false);
                    });
                });
            }
            var payload = {
                wishlistId: this.get('id'),
                quantity: quantity || 1,
                product: item
            };

            return this.apiModel.addItemTo(payload, { silent: true }).then(function (data) {
                //self.get('items').add(new WishlistModels.WishlistItem(data.data), { merge: true });
                return self.apiGet();
            }).ensure(function () {
                self.isLoading(false);
            });
        }
    });

    var WishlistsModel = Backbone.MozuModel.extend({
        defaults: {
            isEditMode: false
        },
        relations: {
            wishlist: WishlistModel
        },
        setWishlist: function (wishlist) {
            if (!(wishlist instanceof WishlistModel)) {
                if (wishlist.toJSON)
                    wishlist = wishlist.toJSON();
                wishlist = new WishlistModel(wishlist);
            }
            this.get('wishlist').clear();
            if (this.get('wishlist').get('items').length) {
                this.get('wishlist').get('items').reset();
            }
            wishlist.get('items').forEach(function(item){
                item.get('product').url = (HyprLiveContext.locals.siteContext.siteSubdirectory || '')+'/p/'+item.get('product').productCode;
            });
            this.set('wishlist', wishlist);
            this.get('wishlist').syncApiModel();
        },
        setEditMode: function (flag) {
            return this.set('isEditMode', flag);
        },
        toggleEditMode: function () {
            if (this.get('isEditMode')) {
                return this.setEditMode(false);
            }
            return this.setEditMode(true);
        }
    });

    var WishlistsMozuGrid = MozuGrid.extend({
      render: function(){
          var self = this;
          this.populateWithUsers();
          MozuGrid.prototype.render.apply(self, arguments);
      },
      populateWithUsers: function(){
          var self = this;
          self.model.get('items').models.forEach(function(list){
              var userInQuestion = window.b2bUsers.find(function(user){
                  return (user.userId === list.get('userId'));
              });
              list.set('fullName', userInQuestion.firstName+' '+userInQuestion.lastName);
          });
          return self.model;
      }
    });

    var WishlistsView = Backbone.MozuView.extend({
        templateName: 'modules/b2b-account/wishlists/my-wishlists',
        additionalEvents: {
            "change [data-mz-value='wishlist-quantity']": "onQuantityChange"
        },
        initialize: function(){
            Backbone.MozuView.prototype.initialize.apply(this, arguments);
            this.model.set('viewingAllLists', true);
        },
        newWishlist: function () {
            this.model.setWishlist({});
            this.model.setEditMode(true);
            this.render();
            //Just the Edit Page that is empty?
        },
        removeWishlist: function (id) {
            var self = this;
            return this.model.get('wishlist').deleteWishlist(id).then(function () {
                self.render();
            });
        },
        copyWishlist: function (wishlist) {
            var self = this;
            wishlist.unset('id');
            if (wishlist.toJSON) {
                wishlist = wishlist.toJSON();
            }
            self.model.isLoading(true);
            return this.model.get('wishlist').apiCreate(wishlist).then(function () {
                self.render();
            }, function(error){
                MessageHandler.saveMessage('CopyWishList', 'Error', error.message);
                MessageHandler.showMessage('CopyWishList');
            }).done(function () {
                self.model.isLoading(false);
            });
        },
        createOrder: function () {
            window.console.log('Create Order');
            //Move to Cart?
        },
        shareWishlist: function () {
            window.console.log('Share Wishlist');
            //Move to Cart?
        },
        toggleViewAllLists: function (e) {
          this._wishlistsGridView.model.setPage(1);
            if (e.currentTarget.checked){
              this.model.set('viewingAllLists', true);
              this._wishlistsGridView.model.filterBy(ALL_LISTS_FILTER);
            } else {
              this.model.set('viewingAllLists', false);
              this._wishlistsGridView.model.filterBy(USER_LISTS_FILTER);
            }
        },
        render: function () {
            Backbone.MozuView.prototype.render.apply(this, arguments);
            var self = this;
            if (this._editWishlist) {
                this._editWishlist.stopListening();
            }
            var editWishlistView = new EditWishlistView({
                el: self.$el.find('.mz-b2b-wishlists-product-picker'),
                model: self.model.get('wishlist'),
                messagesEl: self.$el.find('.mz-b2b-wishlists-product-picker').parent().find('[data-mz-message-bar]')
            });

            var productModalView = new ProductModalViews.ModalView({
                el: self.$el.find("[mz-modal-product-dialog]"),
                model: new ProductModels.Product({}),
                messagesEl: self.$el.find("[mz-modal-product-dialog]").find('[data-mz-message-bar]')
            });

            this._editWishlist = editWishlistView;
            window.productModalView = productModalView;


            $(document).ready(function () {
                if (!self.model.get('isEditMode')) {
                    var collection = new MozuGridCollectionModel();

                    var wishlistsGrid = new WishlistsMozuGrid({
                        el: $('.mz-b2b-wishlists-grid'),
                        model: collection
                    });

                    self._wishlistsGridView = wishlistsGrid;
                    wishlistsGrid.render();
                    return;
                } else {
                    editWishlistView.render();
                }
            });
        }
    });

    var EditWishlistView = Backbone.MozuView.extend({
        templateName: 'modules/b2b-account/wishlists/edit-wishlist',
        autoUpdate: [
            'name',
            'pickerItemQuantity'
        ],
        // initialize: function() {
        //     var self = this;
        //     this.listenToOnce(this.model, "productSelected", function (product) {
        //         self.model.set('isProductSelected', true);
        //         self.addWishlistItem();
        //     });
        // },
        saveWishlist: function () {
            var self = this;
            this.model.saveWishlist().then(function () {
                self.model.parent.setEditMode(false);
                self.model.parent.trigger('render');
            });

            //Just the Edit Page that is empty?
        },
        cancelWishlistEdit: function () {
            this.model.parent.setEditMode(false);
            window.views.currentPane.render();
            //Just the Edit Page that is empty?
        },
        addWishlistItem: function (e) {
            var self = this;
            var product = self.model.get('selectedProduct');
            self.model.messages.reset();

            if (product.options) {

                if (!(product instanceof ProductModels.Product)) {
                    if (product.toJSON)
                        product = product.toJSON();
                    product = new ProductModels.Product(product);
                }
                this.stopListening();
                this.model.isLoading(true);
                this.listenTo(product, "configurationComplete", function () {
                    self.model.addWishlistItem(product.toJSON(), self.model.get('pickerItemQuantity')).then(function () {
                        self.model.unset('selectedProduct');
                        window.productModalView.handleDialogCancel();
                        $('.mz-b2b-wishlists .mz-searchbox-input.tt-input').val('');
                        $('.mz-b2b-wishlists #pickerItemQuantity').val(1);
                        self.model.isLoading(false);
                    }, function (error) {
                        window.productModalView.model.messages.reset({ message: error.message });
                        self.model.isLoading(false);
                    });
                });

                window.productModalView.loadAddProductView(product);
                window.productModalView.handleDialogOpen();
                return;
            }

            window.views.currentPane.model.get('wishlist').addWishlistItem(product, self.model.get('pickerItemQuantity')).then(function () { }, function (error) {
                self.model.messages.reset({ message: error.message });
            });
            self.model.unset('selectedProduct');
            $('.mz-b2b-wishlists .mz-searchbox-input.tt-input').val('');
            $('.mz-b2b-wishlists #pickerItemQuantity').val(1);
        },
        render: function () {
            Backbone.MozuView.prototype.render.apply(this, arguments);
            var self = this;
            $('#wishlistName').focusout(function () {
                self.model.saveWishlist();
            });

            var wishlistListView = new WishlistListView({
                el: self.$el.find('.mz-b2b-wishlist-list'),
                model: self.model
            });
            wishlistListView.render();

            var productPickerView = new ProductPicker({
                el: self.$el.find('[mz-wishlist-product-picker]'),
                model: self.model
            });

            productPickerView.render();
        }
    });

    var WishlistListView = Backbone.MozuView.extend({
        templateName: 'modules/b2b-account/wishlists/wishlist-list',
        additionalEvents: {
            "change [data-mz-value='wishlist-quantity']": "onQuantityChange"
        },
        onQuantityChange: _.debounce(function (e) {
            var $qField = $(e.currentTarget),
                newQuantity = parseInt($qField.val(), 10);
            if (!isNaN(newQuantity)) {
                this.updateQuantity(e);
            }
        }, 500),
        updateQuantity: function (e) {
            var self = this,
                $qField = $(e.currentTarget),
                newQuantity = parseInt($qField.val(), 10),
                id = $qField.data('mz-cart-item'),
                item = this.model.get("items").get(id);

            if (item && !isNaN(newQuantity)) {
                item.set('quantity', newQuantity);
                var payload = item.toJSON();
                payload.id = self.model.get('id');
                payload.itemId = item.get('id');

                this.model.apiModel.editItem(payload, { silent: true }).then(function(){
                    self.model.apiGet();
                });

            }
        },
        beginRemoveItem: function (e) {
            var self = this;
            var id = $(e.currentTarget).data('mzItemId');
            if (id) {
                var removeWishId = id;
                return this.model.apiModel.deleteItem({ id: self.model.get('id'), itemId: id }, { silent: true }).then(function () {

                    self.model.apiGet();
                });
            }
        }
    });

    var MozuGridCollectionModel = MozuGridCollection.extend({
        mozuType: 'wishlists',
        filter: ALL_LISTS_FILTER,
        columns: [
            {
                index: 'name',
                displayName: 'List Name',
                sortable: true
            },
            {
                index: 'auditInfo',
                displayName: 'Date Created',
                displayTemplate: function (auditInfo) {
                    if (auditInfo) {
                        var date = new Date(auditInfo.createDate);
                        return date.toLocaleDateString();
                    }
                }
            },
            {
                index: 'fullName',
                displayName: 'Created By',
                displayTemplate: function(value){
                    return (value || '');
                }
            }
        ],
        defaultSort: 'updateDate desc',
        rowActions: [
            {
                displayName: 'Edit',
                action: 'editWishlist'
            },
            {
                displayName: 'Delete',
                action: 'deleteWishlist'
            },
            {
                displayName: 'Copy',
                action: 'copyWishlist'
            },
            {
                displayName: 'Order',
                action: 'addWishlistToCart',
                isHidden: function () {
                    // 1008 = Can place orders
                    return !this.hasRequiredBehavior(1008);
                }
            }
        ],
        relations: {
            items: Backbone.Collection.extend({
                model: WishlistModel
            })
        },
        deleteWishlist: function (e, row) {
            window.console.log('Remove Wishlist');
            //var rowIndex = $(e.target).parents('.mz-grid-row').data('mzRowIndex');
            //var wishlistId = e.target.data("mzWishlistId");
            //Confirmation Modal
            window.views.currentPane.removeWishlist(row.get('id'));
        },
        editWishlist: function (e, row) {
            window.console.log('Edit Wishlist');
            //var rowIndex = $(e.target).parents('.mz-grid-row').data('mzRowIndex');

            window.views.currentPane.model.setWishlist(row);
            window.views.currentPane.model.setEditMode(true);
            window.views.currentPane.render();
        },
        addWishlistToCart: function (e, row) {
            var cart = CartModels.Cart.fromCurrent();
            var items = row.get('items').toJSON();
            var products = [];

            _.each(items, function(item) {
                var isItemDigital = _.contains(item.product.fulfillmentTypesSupported, "Digital");

                products.push({
                    quantity : item.quantity,
                    data: item.data,
                    fulfillmentMethod : (!isItemDigital ? "Ship" : "Digital"),
                    product: {
                        productCode : item.product.productCode,
                        variationProductCode : item.product.variationProductCode,
                        bundledProducts : item.product.bundledProducts,
                        options : item.product.options || []
                    }
                });
            });
            //var products = row.get('items').toJSON();
            cart.apiModel.addBulkProducts({ postdata: products, throwErrorOnInvalidItems: false}).then(function(){
                    window.location = (HyprLiveContext.locals.siteContext.siteSubdirectory || '') + "/cart";
                }, function (error) {
                    if (error.items) {
                        var errorMessage = "";
                        _.each(error.items, function(error){
                            var errorProp = _.find(error.additionalErrorData, function(errorData){
                                return errorData.name === "Property";
                            });
                            errorMessage += ('</br ><strong>' + errorProp.value + '</strong> : ' + error.message);
                        });
                        MessageHandler.saveMessage('BulkAddToCart', 'BulkAddToCartErrors', errorMessage);
                        window.location = (HyprLiveContext.locals.siteContext.siteSubdirectory || '') + "/cart";
                    }
            });
        },
        copyWishlist: function (e, row) {
            var wishlistName = 'copy - ' + row.get('name');
            row.set('name', wishlistName);
            row.set('userId', require.mozuData('user').userId);
            window.views.currentPane.copyWishlist(row);
        }
    });

    return {
        'WishlistsModel': WishlistsModel,
        'WishlistsView': WishlistsView
    };
});
