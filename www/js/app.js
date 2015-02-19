// Ionic Starter App

// angular.module is a global place for creating, registering and retrieving Angular modules
// 'starter' is the name of this angular module example (also set in a <body> attribute in index.html)
// the 2nd parameter is an array of 'requires'
angular.module('starter', ['ui.bootstrap', 'ngCordova', 'LocalStorageModule', 'app.controllers', 'app.factories'])

.config(function (localStorageServiceProvider) {
    localStorageServiceProvider.setPrefix('pforzheimAbfallApp');
})

.run(function (DB) {
    document.addEventListener("deviceready", function () {
        // Hide the accessory bar by default (remove this to show the accessory bar above the keyboard
        // for form inputs)
        /*if(window.cordova && window.cordova.plugins.Keyboard) {
      cordova.plugins.Keyboard.hideKeyboardAccessoryBar(true);
    }
    if(window.StatusBar) {
      StatusBar.styleDefault();
    }
*/

        DB.initDB().then(function () {
            console.log("initDB promise resolved");
        }, function (err) {
            console.log("Fehler:", err);
        });

    }, false);
});