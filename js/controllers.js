angular.module('starter.controllers',[] )

.controller("AppCtrl", function AppCtrl($scope, $cordovaSQLite,$cordovaGeolocation,$http) {
        var app = this;
        app.query = {"street":"","hnr":0};
        app.dates = {"RM":[],"RM14":[],"Bio":[],"Papier":[],"Gelb":[]};
        app.showDates = false;
        app.streetSuggestions = [];
        app.showSuggestions = false;
        const pwm_url="http://pfwastemanagementenv-hd7anwmmbc.elasticbeanstalk.com/ServletConnectorServlet";
        const googleGeoLoc_API_Key="AIzaSyDlZDoFEuMLSyEjFZovyj_WwDo-_fTNrmo";

        if(window.localStorage.getItem("street")!="" && window.localStorage.getItem("hnr")!="") {
            // TODO: angularJS localStorage Module benutzen, damit entsprechende native Lösung benutzt wird
            app.query.street=window.localStorage.getItem("street");
            app.query.hnr=parseInt(window.localStorage.getItem("hnr"));
        }

        $scope.getDates = function () {
            app.showDates=false;
            console.log("Sende Straße und Hausnummer",app.query)
            $http.get(pwm_url+'?strasse='+app.query.street+'+&hnr='+app.query.hnr).
                success(function(data,status,headers,config) {
                    console.log("Antwort erhalten:",data);


                    // In Datenbank schreiben
                    angular.forEach(data, function (value,key) {
                        console.log("key",key);
                        var insert_query = "INSERT OR REPLACE INTO collection_dates (street_id, house_number, waste_type, collection_date, date_added) VALUES ((SELECT street_id FROM streets WHERE street_name = ?), ?, ?, ?, ?)";
                        for (var i =0;i<value.length; i++) {
                            date=value[i].trim();

                            date=date.substring(0,10);
                            date=date.substring(6,10)+'-'+date.substring(3,5)+'-'+date.substring(0,2);
                            console.log(key+ ' '+ date);
                            $cordovaSQLite.execute(db, insert_query,[app.query.street,app.query.hnr,key,date, new Date()]).then(
                                function(res) {

                                },
                                function (err) {
                                    console.error(err);
                                });
                        }
                    })
                    app.showDates=true;
                    $scope.saveStreetChoice();
                    $scope.loadDatesForCurrentStreet();
                }).
                error(function(data,status,headers,config) {
                    console.log("Fehler", data);
                    app.showDates=false;
                });
        }

        $scope.getStreets = function (street) {
            console.log("function getStreets",street);
            app.streetSuggestions=[];
            if (street.length>0) {
                var query = "SELECT street_name FROM streets WHERE street_name LIKE ? LIMIT 5";
                $cordovaSQLite.execute(db, query, [street + '%']).then(function (res) {
                    if (res.rows.length > 0) {
                        for (var i = 0; i < res.rows.length; i++) {
                            //console.log(res.rows.item(i).street_name);
                            app.streetSuggestions.push(res.rows.item(i).street_name);
                        }
                        app.showSuggestions = true;
                    } else {
                        console.log("no result")
                    }
                })
            }
        }

        $scope.saveStreetChoice = function() {
            console.log("function saveStreetChoice");
            window.localStorage.setItem("street",app.query.street);
            window.localStorage.setItem("hnr",app.query.hnr);
        }

        $scope.loadDatesForCurrentStreet = function () {
            console.log("function loadDatesForCurrentStreet");
            app.dates=[];
            var query= "SELECT waste_type,strftime('%d.%m.%Y',collection_date) as collection_date FROM collection_dates WHERE street_id=(SELECT street_id FROM streets WHERE street_name= ? ) AND house_number= ? AND collection_date BETWEEN date('now','localtime') AND date('now', '+21 days','localtime') ORDER BY collection_dates.collection_date,1";
            $cordovaSQLite.execute(db, query, [app.query.street,app.query.hnr]).then(function (res) {
                if (res.rows.length > 0) {
                    var loop_last_change_cd;
                    var last_index=0;
                    var loop;
                    for(var i = 0 ; i<res.rows.length;i++) {
                        loop = res.rows.item(i);
                        console.log("loop",loop);
                        console.log("loop_before",loop_last_change_cd);
                        if(loop.collection_date==loop_last_change_cd) {
                            // collection_date ist gleich, waste_type wird dem zweiten property des objects app.dates hinzugefügt
                            app.dates[last_index].waste_type.push(loop.waste_type);
                        }
                        else {
                            // neues collection_date
                            app.dates.push({"collection_date": loop.collection_date, "waste_type":[loop.waste_type]});
                            last_index=app.dates.length-1;
                            loop_last_change_cd=loop.collection_date;
                        }

                        console.log('{"'+res.rows.item(i).waste_type+'":"'+res.rows.item(i).collection_date+'"}');
                    }
                } else {
                    console.log("loadDatesForCurrentStreet: no result")
                }
            }, function(err) {
                console.error(err)
            })
        }

        $scope.getStreetFromLocation = function () {
            var posOptions = {timeout:10000, enableHighAccuracy:true}
            $cordovaGeolocation
                .getCurrentPosition(posOptions)
                .then(function (position) {
                    var lat  = position.coords.latitude
                    var long = position.coords.longitude
                    console.log("lat",lat);
                    console.log("long",long);
                    $http.get("https://maps.googleapis.com/maps/api/geocode/json?latlng="+lat+","+ long+ "&language=de&location_type=ROOFTOP&result_type=street_address&key="+googleGeoLoc_API_Key).
                        success(function(data,status,headers,config) {
                            console.log("Antwort erhalten:",data);
                            var address_components=data.results[0].address_components;
                            for (var i=0;i<address_components.length;i++) {
                                if (address_components[i].types[0] == "route") {
                                    app.query.street = address_components[i].long_name;
                                    if (app.query.street  == "Tiefenbronner Straße") {
                                        app.query.street="Tiefenbronner Str.";
                                    }
                                }
                                else if (address_components[i].types[0] == "street_number") {
                                    app.query.hnr = parseInt(address_components[i].long_name);
                                }
                            }

                            $scope.getDates();
                        }).
                        error(function(data,status,headers,config) {
                            console.log("Fehler", data);
                            app.showDates=false;
                        });
                }, function(err) {
                    // error
                });
        }
        //$scope.loadDatesForCurrentStreet();
// UNIT TESTS: Jasmine
// Funktionen in Services auslagern
// In store bekommen, provisioning
// GitHub
// weg von IONIC, stattdessen Bootstrap

    });