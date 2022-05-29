// Copyright Brendan Ashworth 2022

// sample, if given obs, will return obs
const randomVariables = {
  uniform: {
    name: 'uniform',
    sample: (a, b, obs) => obs || a + (b-a)*Math.random(),
    pdf: (x, a, b) => (a <= x && x <= b) ? 1.0/(b-a) : 0.0
  },
  normal: {
    name: 'normal',
    sample: (mu, sigma, obs) => obs || mu + sigma * Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random()),
    pdf: (x, mu, sigma) => (1 / sigma * Math.sqrt(2 * Math.PI)) * Math.exp(-1/2 * Math.pow((x - mu)/sigma, 2))
  },
  exponential: {
    name: 'exponential',
    sample: (lambda, obs) => obs || - Math.log(Math.random()) / lambda,
    pdf: (x, lambda) => lambda * Math.exp(-lambda * x)
  }
};

class Simulation {
  constructor() {
    this.factors = {};
    this.trace = {};
  }

  // If it already exists, transition according to MCMC (jiggle)
  sampleOrStepFactor(name, rv, ...vars) {
    const isObserved = randomVariables[rv.name].sample.length == vars.length;

    if (this.factors[name] && !isObserved) {
      this.factors[name].value += randomVariables.normal.sample(0.0, 0.2);
    } else {
      this.factors[name] = {
        rv: rv.name,
        params: vars,
        value: rv.sample(...vars)
      }
    }
  }

  // Handle passed arrays gracefully by spreading them out
  // into individual variables
  _spread(rv, name, ...vars) {
    if (Array.isArray(vars[0])) {
      let rets = Array(vars[0].length);

      for (let i = 0; i < vars[0].length; i++) {
        let dims = vars.map(e => e[i]);
        const iname = `${name}_${i}`;

        this.sampleOrStepFactor(iname, rv, ...dims);

        rets[i] = this.factors[iname].value;
      }

      return rets;
    } else {
      this.sampleOrStepFactor(name, rv, ...vars);

      return this.factors[name].value;
    }
  }

  uniform(name, a, b) {
    return this._spread(randomVariables.uniform, ...arguments);
  }
  normal(name, mu, sigma, obs) {
    return this._spread(randomVariables.normal, ...arguments);
  }
  exponential(name, lambda, obs) {
    return this._spread(randomVariables.exponential, ...arguments);
  }
}
module.exports.Simulation = Simulation;

// go to every factor and combine into one joint probability
function calculate_joint(sim) {
  return Object.entries(sim.factors).map(e => {
    const [name, factor] = e;

    return Math.log(randomVariables[factor.rv].pdf(factor.value, ...factor.params));
  }).reduce((a, b) => a + b, 0.0);
}

module.exports.simulate = function simulate(model, ...args) {
  const sim = new Simulation();

  model(sim, ...args);

  return sim;
}

module.exports.transition = function transition(sim, model, ...args) {
  const beforeProb = calculate_joint(sim);
  const beforeFactors = JSON.parse(JSON.stringify(sim.factors));

  model(sim, ...args);

  const afterProb = calculate_joint(sim);

  const acceptProb = afterProb - beforeProb;
  if (Math.log(Math.random()) > acceptProb) {
    // reject
    sim.factors = beforeFactors;
  }

  Object.entries(sim.factors).forEach(e => {
    if (!sim.trace[e[0]])
      sim.trace[e[0]] = [];

    sim.trace[e[0]].push(e[1].value);
  });
}
