/**
 * app.js
 * Startpunkt der App. Initialisiert Abhängigkeiten und ruft DB-Initialisierung auf.
 * @author Johannes Steier
 */

'use strict';
// angular.module is a global place for creating, registering and retrieving Angular modules
// 'starter' is the name of this angular module example (also set in a <body> attribute in index.html)
// the 2nd parameter is an array of 'requires'
angular.module('starter', ['ngRoute', 'mobile-angular-ui', 'ngCordova', 'LocalStorageModule', 'app.controllers', 'app.factories'])

    .config(function (localStorageServiceProvider) {
        localStorageServiceProvider.setPrefix('pforzheimAbfallApp');
    })
    /*
    App starten.
     */
    .run(function (AppReady,$rootScope, $q,DB,Logger) {
        var q = $q.defer();
        $rootScope.dbReady = q.promise;

        AppReady.ready().then(function () {
            DB.initDB().then(function () {
                q.resolve();
                Logger.log("initDB promise resolved, dbReady resolved");
            }, function (err) {
                q.reject();
                Logger.log("App.js Fehler: "+ err);
            });

        });
    });