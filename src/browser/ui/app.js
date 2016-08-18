import React from 'react';
import ReactDOM from 'react-dom';

class App extends React.Component {
  render() {
    return (
      <div className="flex-across">
        <div className="flex-down">
          <Controls player={this.props.player}/>
          <Oscilloscope width={1600} height={600} data={this.props.output}/>
          {/*<Pattern pattern={this.props.module.patternTable[this.props.player.position]}/>*/}
        </div>
        <Samples samples={this.props.module.samples}/>
      </div>
    );
  }
}

class Controls extends React.Component {
  render() {
    return (
      <div className="flex-across">
        <button onClick={this.back}>⏪</button>
        <button onClick={this.play}>⏯</button>
        <button onClick={this.forward}>⏩</button>
      </div>
    );
  }

  play = () => {
    this.props.player.pause();
  }

  back = () => {
    this.props.player.back();
  }

  forward = () => {
    this.props.player.forward();
  }
}

class Samples extends React.Component {
  render() {
    return (
      <div className="flex-down">
        {this.props.samples.map(sample => <Sample sample={sample}/>)}
      </div>
    );
  }
}

class Sample extends React.Component {
  render() {
    return (
      <div>
        <Oscilloscope data={this.props.sample.buffer} width={400} height={200} static/>
        <h3>{this.props.sample.name}</h3>
      </div>
    )
  }
}

class Oscilloscope extends React.Component {
  constructor(props) {
    super(props);
    this.offscreen = document.createElement('canvas');
    this.offscreen.width = props.width;
    this.offscreen.height = props.height;
  }

  componentDidMount() {
    const node = ReactDOM.findDOMNode(this)
    const context = this.offscreen.getContext('2d');
    this.paint(node, context, this.props.width, this.props.height);
  }

  componentDidUpdate() {
    if (this.props.static) {
      return;
    }

    const node = ReactDOM.findDOMNode(this)
    const context = this.offscreen.getContext('2d');
    context.clearRect(0, 0, this.props.width, this.props.height);
    this.paint(node, context, this.props.width, this.props.height);
  }

  paint(node, context, width, height) {
    context.clearRect(0, 0, this.props.width, this.props.height);
    context.fillStyle = "#333";

    context.beginPath();
    context.moveTo(0, 200);
    for (let i = 0; i < width; i++) {
      const offset = this.props.data.length / width * i;
      const amplitude = (this.props.data[Math.floor(offset)] + 1) * height / 2;
      context.lineTo(i, amplitude, 1, 1);
    }
    context.stroke();
    this._lastUpdate = Date.now();

    const onscreenContext = node.getContext('2d');
    onscreenContext.clearRect(0, 0, this.props.width, this.props.height);
    onscreenContext.drawImage(this.offscreen, 0, 0);
  }

  render() {
    return (
      <canvas width={this.props.width} height={this.props.height} style={{width: this.props.width/2 + 'px', height: this.props.height/2 + 'px'}}/>
    )
  }
}

export default App;
