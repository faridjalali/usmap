let svg, g, zoom, projection, path;
let width, height;
let currentTargetAbbr = "";
let currentPhase = "MAP_SELECTION";
let score = 0;
let visited = new Set();
let currentScale = 1;
let isCapitalMode = true;
let targetCityName = "";
let feedbackTimeout;
let clearTextTimeout;

window.onload = initGame;

async function initGame() {
  width = window.innerWidth;
  height = window.innerHeight;
  const container = d3.select("#map-stage");
  svg = container
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");
  g = svg.append("g");
  zoom = d3
    .zoom()
    .scaleExtent([1, 15])
    .on("zoom", (e) => {
      g.attr("transform", e.transform);
      currentScale = e.transform.k;
      d3.selectAll(".city-node")
        .attr("r", 6 / currentScale);
    });
  svg.call(zoom);

  try {
    const us = await d3.json(
      "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json",
    );
    const stateFeatures = topojson.feature(us, us.objects.states).features;
    projection = d3
      .geoAlbersUsa()
      .fitSize([width, height], topojson.feature(us, us.objects.states));
    path = d3.geoPath().projection(projection);

    const nameToAbbr = Object.entries(gameData).reduce((acc, [abbr, data]) => {
      acc[data.name] = abbr;
      return acc;
    }, {});

    g.selectAll("path")
      .data(stateFeatures)
      .enter()
      .append("path")
      .attr("d", path)
      .attr("class", (d) => {
        if (d.properties.name === "District of Columbia")
          return "state reg-northeast";
        const abbr = nameToAbbr[d.properties.name];
        const region = gameData[abbr] ? gameData[abbr].region : "unknown";
        return `state reg-${region}`;
      })
      .attr("id", (d) => {
        if (d.properties.name === "District of Columbia") return "state-DC";
        const abbr = nameToAbbr[d.properties.name];
        return abbr ? `state-${abbr}` : null;
      })
      .on("click", handleStateClick);

    startRound();
  } catch (err) {
    console.error(err);
  }
}

function toggleMode() {
  if (currentPhase === "CITY_SELECTION") return;
  isCapitalMode = !isCapitalMode;
  const container = document.getElementById("mode-toggle");
  const label = document.getElementById("mode-label");
  if (isCapitalMode) {
    container.classList.add("active");
    label.innerText = "Capital";
  } else {
    container.classList.remove("active");
    label.innerText = "Fact";
  }
}

function startRound() {
  const keys = Object.keys(gameData);
  const available = keys.filter((k) => !visited.has(k));
  if (available.length === 0) {
    alert("Game Complete!");
    visited.clear();
    score = 0;
    startRound();
    return;
  }

  currentTargetAbbr = available[Math.floor(Math.random() * available.length)];
  visited.add(currentTargetAbbr);

  currentPhase = "MAP_SELECTION";
  resetZoom();
  d3.selectAll(".state").classed("active-focused", false);
  d3.selectAll(".city-node").remove();
  document.getElementById("fact-overlay").classList.remove("show");

  document.getElementById("find-label").innerText = "Find State";
  document.getElementById("main-prompt").innerText =
    gameData[currentTargetAbbr].name;
  document.getElementById("target-state").innerText = currentTargetAbbr;
  document.getElementById("sub-prompt").innerText = "";
  updateScoreUI();
}

function handleStateClick(event, d) {
  if (currentPhase !== "MAP_SELECTION") return;
  const clickedId = this.id;
  const clickedAbbr = clickedId ? clickedId.replace("state-", "") : null;

  if (clickedAbbr === currentTargetAbbr) {
    score += 10;
    updateScoreUI();
    flashState(this, "correct");
    transitionToCityPhase(d, clickedAbbr);
  } else {
    score -= 10;
    updateScoreUI();
    flashState(this, "wrong");
    let wrongName = gameData[clickedAbbr]
      ? gameData[clickedAbbr].name
      : "unknown territory";
    if (clickedAbbr === "DC") wrongName = "Washington DC";
    const targetName = gameData[currentTargetAbbr].name;
    document.getElementById("find-label").innerText = "Find";
    document.getElementById("main-prompt").innerHTML = `${targetName}`;

    clearTimeout(feedbackTimeout);
    clearTimeout(clearTextTimeout);
    const subPrompt = document.getElementById("sub-prompt");
    subPrompt.innerHTML = `That is <span class="wrong-state-highlight">${wrongName}</span>`;
    subPrompt.classList.add("visible");

    feedbackTimeout = setTimeout(() => {
      subPrompt.classList.remove("visible");
      clearTextTimeout = setTimeout(() => {
        subPrompt.innerHTML = "";
      }, 300);
    }, 3000);
  }
}

function transitionToCityPhase(geoData, abbr) {
  currentPhase = "CITY_SELECTION";
  zoomToState(geoData);
  d3.select(`#state-${abbr}`).classed("active-focused", true);

  const data = gameData[abbr];
  document.getElementById("find-label").innerText = "Find";
  document.getElementById("sub-prompt").innerText = "";

  if (isCapitalMode) {
    targetCityName = data.capital;
    document.getElementById("main-prompt").innerText =
      `The capital of ${data.name}`;
  } else {
    const cityNames = Object.keys(data.cities);
    targetCityName = cityNames[Math.floor(Math.random() * cityNames.length)];
    document.getElementById("main-prompt").innerText =
      data.facts[targetCityName];
  }

  plotCities(abbr);
  setTimeout(() => {
    d3.selectAll(".city-node").style("pointer-events", "auto");
  }, 800);
}

function plotCities(abbr) {
  const data = gameData[abbr];
  const nodes = Object.entries(data.cities)
    .map(([name, coords]) => {
      const projected = projection(coords);
      return projected ? { name, x: projected[0], y: projected[1] } : null;
    })
    .filter((n) => n);

  g.selectAll(".city-node")
    .data(nodes)
    .enter()
    .append("circle")
    .attr("class", "city-node")
    .attr("cx", (d) => d.x)
    .attr("cy", (d) => d.y)
    .attr("r", 0)
    .on("mouseover", showTooltip)
    .on("mousemove", moveTooltip)
    .on("mouseout", hideTooltip)
    .on("click", (e, d) => handleCityClick(e, d, abbr))
    .transition()
    .duration(500)
    .delay(400)
    .attr("r", 6 / currentScale);
}

function handleCityClick(event, cityNode, abbr) {
  const data = gameData[abbr];
  const isCorrect = cityNode.name === targetCityName;
  const dot = d3.select(event.currentTarget);

  if (dot.classed("wrong-choice") || dot.classed("correct-choice")) return;

  if (isCorrect) {
    dot.classed("correct-choice", true);
    score += 10;
    updateScoreUI();
    showFact(cityNode.name, abbr, "CORRECT", "status-correct");
  } else {
    dot.classed("wrong-choice", true);
    score -= 10;
    updateScoreUI();
    showFact(cityNode.name, abbr, "INCORRECT", "status-wrong");
  }
}

function showFact(cityName, abbr, status, statusClass) {
  const data = gameData[abbr];
  const overlay = document.getElementById("fact-overlay");
  const btn = document.getElementById("next-action-btn");

  document.getElementById("fact-status").innerText = status;
  document.getElementById("fact-status").className =
    `fact-status ${statusClass}`;
  document.getElementById("fact-city-name").innerText = cityName;
  document.getElementById("fact-text").innerHTML = data.facts[cityName];

  btn.innerText = status === "CORRECT" ? "Next Mission" : "Keep Searching";
  btn.onclick =
    status === "CORRECT"
      ? resetGameRound
      : () => overlay.classList.remove("show");

  overlay.classList.add("show");
}

function updateScoreUI() {
  document.getElementById("score-val").innerText = score;
}
function showTooltip(e, d) {
  const tt = document.getElementById("city-tooltip");
  tt.innerText = d.name;
  tt.style.opacity = 1;
}
function moveTooltip(e) {
  const tt = document.getElementById("city-tooltip");
  tt.style.left = e.pageX + "px";
  tt.style.top = e.pageY + "px";
}
function hideTooltip() {
  document.getElementById("city-tooltip").style.opacity = 0;
}
function resetGameRound() {
  startRound();
}

function zoomToState(d) {
  const b = path.bounds(d);
  const s = Math.max(
    1,
    Math.min(
      10,
      0.7 / Math.max((b[1][0] - b[0][0]) / width, (b[1][1] - b[0][1]) / height),
    ),
  );
  const t = [
    width / 2 - (s * (b[0][0] + b[1][0])) / 2,
    height / 2 - (s * (b[0][1] + b[1][1])) / 2,
  ];
  svg
    .transition()
    .duration(1000)
    .call(zoom.transform, d3.zoomIdentity.translate(t[0], t[1]).scale(s));
}

function resetZoom() {
  svg.transition().duration(1000).call(zoom.transform, d3.zoomIdentity);
}
function flashState(el, type) {
  d3.select(el).classed(type + "-flash", true);
  setTimeout(() => d3.select(el).classed(type + "-flash", false), 500);
}
