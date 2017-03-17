'use strict';

const XMLHttpRequest = require('xhr2');

let Wit = null;
let interactive = null;
try {
  // if running from repo
  Wit = require('../').Wit;
  interactive = require('../').interactive;
} catch (e) {
  Wit = require('node-wit').Wit;
  interactive = require('node-wit').interactive;
}

const accessToken = (() => {
  if (process.argv.length !== 3) {
    console.log('usage: node examples/kanap.js <wit-access-token>');
    process.exit(1);
  }
  return process.argv[2];
})();

const firstEntityValue = (entities, entity) => {
  const val = entities && entities[entity] &&
    Array.isArray(entities[entity]) &&
    entities[entity].length > 0 &&
    entities[entity][0].value
  ;
  if (!val) {
    return null;
  }
  return typeof val === 'object' ? val.value : val;
};

function makeRequest (method, url) {
  return new Promise(function (resolve, reject) {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.onload = function () {
      if (this.status >= 200 && this.status < 300) {
        resolve(xhr.response);
      } else {
        reject({
          status: this.status,
          statusText: xhr.statusText
        });
      }
    };
    xhr.onerror = function () {
      reject({
        status: this.status,
        statusText: xhr.statusText
      });
    };
    xhr.send();
  });
}

function addDataToContext(context,result,movies,maxRecommendations)
{
  let resultInRequest = false;
  for (let i = 0; context.ids.length < maxRecommendations && i < result.hits.hits.length && result.hits.hits[i]._score > 10; i++) {
    // Check if result title was one of the requested titles to avoid problems with sequels
    for (let j = 0; j < movies.length; j++) {
      resultInRequest = resultInRequest || result.hits.hits[i]._source.title.search(new RegExp(movies[j].value, "i"));
    }
    if (resultInRequest == true || context.ids.includes(result.hits.hits[i]._id)) {
      resultInRequest = false;
      continue;
    }
    context.message += "- " + result.hits.hits[i]._source.title + "\n";
    context.message += "  https://www.themoviedb.org/movie/" + result.hits.hits[i]._id + "\n\n";
    context.ids.push(result.hits.hits[i]._id);
  }
}

const actions = {
  send(request, response) {
    const {sessionId, context, entities} = request;
    const {text, quickreplies} = response;
    console.log('sending...', JSON.stringify(response));
  },
  recommend({context,entities})
  {
    const movies = entities.movie;
    if (movies.size == 1){
      movies.push(context.movie);
    }
    
    context.message = "Loading";
    
    // Compose the request string
    let searchStringExact = '"';
    let searchStringApprox = '';
    for (let i in movies)
    {
      searchStringExact += movies[i].value + '"';
      searchStringApprox += movies[i].value;
      if (i < movies.length - 1)
        searchStringExact += '+"';
        searchStringApprox += '+"';
    }
    
    // Request to elastic search server
    const urlExact = `http://search-kanap-qpmdgkuz3m33pqyzu2ir5swx4a.eu-west-1.es.amazonaws.com/content/_search?q=${searchStringExact}`;
    const urlApprox = `http://search-kanap-qpmdgkuz3m33pqyzu2ir5swx4a.eu-west-1.es.amazonaws.com/content/_search?q=${searchStringApprox}`;
  
    // Call elasticSearch api
    return makeRequest('GET', urlExact).then(result => {
      result = JSON.parse(result);
      context.ids = [];
      const maxRecommendations = 5;
      context.message = `You may like the following titles:\n`; //Parsed JSON
      addDataToContext(context,result,movies,maxRecommendations);
      if (context.ids.length < maxRecommendations)
      {
          return makeRequest('GET', urlApprox).then(result => {
            result = JSON.parse(result);
            addDataToContext(context,result,movies,maxRecommendations);
            return context;
          });
      }
      return context;
      });
      
  },
  waitForSecondEntry({context,entities})
  {
    const movie = entities.movie;
    context.movie = movie;
    return context;
  }
};

const client = new Wit({accessToken, actions});
interactive(client);