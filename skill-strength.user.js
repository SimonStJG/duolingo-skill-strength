// ==UserScript==
// @name         Duolingo Skill Strength Viewer
// @namespace    http://blog.fabianbecker.eu/
// @version      0.2.1
// @description  Shows individual skill strength
// @author       Fabian Becker
// @match        https://www.duolingo.com/*
// @downloadURL  https://github.com/simonstjg/duolingo-skill-strength/raw/master/skill-strength.user.js
// @updateURL    https://github.com/simonstjg/duolingo-skill-strength/raw/master/skill-strength.user.js
// @require      http://ajax.googleapis.com/ajax/libs/jquery/1.7.2/jquery.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.11/lodash.min.js
// @require      https://www.chartjs.org/dist/2.7.3/Chart.bundle.js
// @grant        none
// ==/UserScript==

function addGlobalStyle(css) {
    var head, style;
    head = document.getElementsByTagName('head')[0];
    if (!head) { return; }
    style = document.createElement('style');
    style.type = 'text/css';
    style.innerHTML = css;
    head.appendChild(style);
}

addGlobalStyle(
    ".list-skills { margin: 30px -20px 0 -10px; overflow: auto; max-height: 255px; padding: 10px; }" +
    ".list-skills-item { padding: 0 10px 0 0; margin: 10px 0 0 0; }" +
    ".list-skills-item:before { display: table; content: ''; line-height: 0; }" +
    ".list-skills-item .points { float: right; font-weight: 300; color: #999; }" +
    ".list-skills-item .name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }"
);

function inject(f) { //Inject the script into the document
  var script;
  script = document.createElement('script');
  script.type = 'text/javascript';
  script.setAttribute('name', 'skill_strength');
  script.textContent = '(' + f.toString() + ')(jQuery)';
  document.body.appendChild(script);
}
inject(f);

function f($) {
    function handleVocabulary(data) {
        var vocab = data.vocab_overview,
            fuerte = 0.0,
            edad = 0.0,
            ahora = new Date().getTime();

        var averageStrength = _.mean(vocab.map(function(v) { return v.strength; }));
        var averageAge = _.mean(vocab.map(function(v) { return (ahora - v.last_practiced_ms) / 1000 ; }));
        var medianAge = median(vocab.map(function(v) { return (ahora - v.last_practiced_ms) / 1000 ; }));
        var zeroStrength = vocab.filter(function(v) { return v.strength === 0; }).length;

        var skillStrength = calculateSkillStrength(vocab);
        console.log("Average Strength: " + averageStrength);
        console.log("Dead words (0 strength): " + zeroStrength);
        var deadwords = vocab.filter(function(v) { return v.strength === 0; });
        var deadwordsDict = _.countBy(deadwords.map(a=>a.skill_url_title),function(word){return word;});
        var allwordsDict = _.countBy(vocab.map(a=>a.skill_url_title),function(word){return word;});

        console.log("Average Age (hours): " + averageAge / 3600);
        console.log("Median Age (hours): " + medianAge / 3600);

        stored_strength = _.map(
            JSON.parse(window.localStorage.getItem("__skill_strength") || "[]"), 
            e => [new Date(e[0]), e[1], e[2]]
        )
        stored_strength.push([new Date(), averageStrength, zeroStrength])
        window.localStorage.setItem("__skill_strength", JSON.stringify(stored_strength))

        var language = data.learning_language;
        var skillStrengthInfoBox = $("<div class='box-gray' id='skillstrength'></div>");
        var list = $("<ul class='list-skills'></ul>");
        var skillIdMap = {};

        _.each(skillStrength, function (skill) {
            var item = $("<li class='list-skills-item'></li>");
            item.append("<span class='points'>" + (skill.strength * 100).toFixed(1) + " %</span>");
            item.append("<span class='name'><a class='username' href='/skill/" + language + "/" + skill.url + "/practice'>" + skill.name + "</a> ("+(skill.url in deadwordsDict?deadwordsDict[skill.url]:0)+"/"+allwordsDict[skill.url]+")</span>");
            list.append(item);
        });

        skillStrengthInfoBox.append(
            $("<h2>Skill Strength</h2>"),
            $("<div class='board'></div>").append(list)
        );

        skillStrengthInfoBox.append("<span><strong>Overall Strength: </strong>" + (averageStrength * 100).toFixed(1) + " %</span><br />");
        skillStrengthInfoBox.append("<span><strong>Dead Words (0 Strength): </strong>" + zeroStrength + "/" + vocab.length + "</span>");

        [labels, averageStrengths, zeroStrengths] = _.zip.apply(_, stored_strength)
        var timeFormat = 'MM/DD/YYYY HH:mm';
        var graphConfig = {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Overall Strength',
                    fill: false,
                    data: averageStrengths
                }]
            },
            options: {
                title: {
                    text: 'Average Strength / Zero Strength'
                },
                scales: {
                    xAxes: [{
                        type: 'time',
                        time: {
                            format: timeFormat,
                            // round: 'day'
                            tooltipFormat: 'll HH:mm'
                        },
                        scaleLabel: {
                            display: true,
                            labelString: 'Date'
                        }
                    }],
                    yAxes: [{
                        scaleLabel: {
                            display: true,
                            labelString: 'value'
                        }
                    }]
                },
            }
        };

        var skillStrengthGraph = $("<div class='box-gray' id='skillstrength'><canvas id='canvas' style='display: block; width: 1004px; height: 502px;' width='1004' height='502' class='chartjs-render-monitor'></canvas></div>")
  
        displaySidebarElement(skillStrengthGraph);
        displaySidebarElement(skillStrengthInfoBox);

        var ctx = document.getElementById('canvas').getContext('2d');
        window.skillStrengthGraph = new Chart(ctx, graphConfig);      
  
        isLoading = false;
    }

    function displaySidebarElement(el) {
        if ($("section.sidebar-left > div.inner").length > 0) {
            $("section.sidebar-left > div.inner").append(el);
        } else {
            var parent = $("h2:contains('Leaderboard'),h2:contains('Bestenliste'),h2:contains('Tabella campioni'),h2:contains('Ranking'),h2:contains('Tablero de posiciones'),h2:contains('Classement')").parent();

            el.addClass(parent.attr('class'));
            el.insertAfter(parent);
        }
    }

    function median(data) {
        var m = _.sortBy(data);

        var middle = Math.floor((m.length - 1) / 2); // NB: operator precedence
        if (m.length % 2) {
            return m[middle];
        } else {
            return (m[middle] + m[middle + 1]) / 2.0;
        }
    }

    function calculateSkillStrength(vocab) {
        var skills = _.chain(vocab)
            .groupBy('skill')
            .map(function(value, key) {
                return {
                    name: key,
                    strength: _.meanBy(value, "strength"),
                    url: value[0].skill_url_title
                };
            }).value();

        // Sort by strength (weakest first)
        skills.sort(function (a, b) {
            return a.strength - b.strength;
        });

        return skills;
    }

    // Variable to prevent race condition
    var isLoading = false;

    function isHomeScreen() {
        var v1home = $('#app').hasClass('home');
        var v2home = !!$('#root').length;
        return v1home || v2home;
    }

    /**
     * Fetches vocabulary
     */
    function showSkillStrength() {
        // Only show if we are on the home screen and it's not already there
        if (isHomeScreen() && !$('#skillstrength').length && !isLoading) {
            isLoading = true;
            $.ajax({
                url: '/vocabulary/overview',
                success: function (data) {
                    handleVocabulary(data);
                }
            });
        }
    }

    $(document).ready(function () {
        showSkillStrength();
    });

    function onChange(mutations) {
        if (window.location.pathname == "/"
            && !document.getElementById("skillstrength")
            && !isLoading) {
            showSkillStrength();
        }
    }

    new MutationObserver(onChange).observe(document.body, {
        childList : true,
        subtree : true
    });

}
