// Ionic Starter App

// angular.module is a global place for creating, registering and retrieving Angular modules
// 'starter' is the name of this angular module example (also set in a <body> attribute in index.html)
// the 2nd parameter is an array of 'requires'
angular.module('starter', ['ionic', 'ngCordova', 'starter.controllers'])

.run(function($ionicPlatform, $cordovaSQLite, $http) {
  $ionicPlatform.ready(function() {
    // Hide the accessory bar by default (remove this to show the accessory bar above the keyboard
    // for form inputs)
    if(window.cordova && window.cordova.plugins.Keyboard) {
      cordova.plugins.Keyboard.hideKeyboardAccessoryBar(true);
    }
    if(window.StatusBar) {
      StatusBar.styleDefault();
    }

      if (window.cordova) {
          db = $cordovaSQLite.openDB({ name: "pwm.db" }); //device
        }else{
          db = window.openDatabase("pwm.db", '1', 'pwm', 1024 * 1024 * 100); // browser
        }

      // Datenbanken erzeugen
      $cordovaSQLite.execute(db, "CREATE TABLE IF NOT EXISTS streets (street_id integer primary key, street_name text)");

      $cordovaSQLite.execute(db, "CREATE TABLE IF NOT EXISTS collection_dates (street_id integer, house_number integer, waste_type text, collection_date date, date_added date, primary key (street_id, house_number, waste_type, collection_date) )");

        // Straßendatenbank aufsetzen, wenn sie noch nicht gefüllt ist
      var query = "SELECT * FROM streets";
      $cordovaSQLite.execute(db, query,[]).then(function(res) {
          if (res.rows.length > 0) {
              console.log("Tabelle streets schon gefüllt");
          } else {
              console.log("Tabelle streets noch nicht gefüllt. Mit Daten füllen.");
              // Aus Datei einlesen und in DB schreiben
              var streets_json={};
              $http.get('streets.json').success (function(data) {
                  streets_json = data;
                  var insert_query = "INSERT INTO streets (street_name) VALUES (?)";
                  for ( o in streets_json) {
                      $cordovaSQLite.execute(db, insert_query,[streets_json[o].s]);
                  }
              });

          }
      }, function (err) {
          console.error(err);
      });


  });
})