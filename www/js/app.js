'use strict';
// angular.module is a global place for creating, registering and retrieving Angular modules
// 'starter' is the name of this angular module example (also set in a <body> attribute in index.html)
// the 2nd parameter is an array of 'requires'
angular.module('starter', ['ngRoute', 'mobile-angular-ui', 'ngCordova', 'LocalStorageModule', 'app.controllers', 'app.factories'])

    .config(function (localStorageServiceProvider) {
        localStorageServiceProvider.setPrefix('pforzheimAbfallApp');
    })

    .run(function ($rootScope, $q,DB,Logger) {
        var q = $q.defer();
        $rootScope.dbReady = q.promise;

        var isCordovaApp = (typeof window.cordova !== "undefined");
        if (navigator.userAgent.match(/(iPhone|iPod|iPad|Android|BlackBerry|IEMobile)/)) {
        //if(isCordovaApp) {
            document.addEventListener("deviceready", onDeviceReady, false);
        } else {
            onDeviceReady();
        }
        //document.addEventListener("deviceready", function () {
        // Hide the accessory bar by default (remove this to show the accessory bar above the keyboard
        // for form inputs)
        /*if(window.cordova && window.cordova.plugins.Keyboard) {
         cordova.plugins.Keyboard.hideKeyboardAccessoryBar(true);
         }
         if(window.StatusBar) {
         StatusBar.styleDefault();
         }
         */
        function onDeviceReady() {
            DB.initDB().then(function () {
                q.resolve();
                Logger.log("initDB promise resolved, dbReady resolved");
            }, function (err) {
                Logger.log("App.js Fehler:", err);
            });
        }

        //}, false);

    });