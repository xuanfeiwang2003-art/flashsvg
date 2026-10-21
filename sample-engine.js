(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FlashSVGDemoEngine = api;
}(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  // These readable SVG units illustrate a block schedule; they are not the
  // model's vocabulary, proposals, probabilities, or a recorded inference run.
  var NUMBER_SOURCE = '[-+]?(?:\\d*\\.\\d+|\\d+\\.?\\d*)(?:[eE][-+]?\\d+)?';
  var NUMBER = new RegExp('^(?:' + NUMBER_SOURCE + ')$');
  var LEXEMES = new RegExp('[a-zA-Z]|' + NUMBER_SOURCE, 'g');
  var ARITY = { M: 2, L: 2, C: 6, Z: 0, H: 1, V: 1, Q: 4, S: 4, T: 2, A: 7 };
  var ACCEPT_PATTERN = [6, 12, 16, 9, 15, 16, 10, 14];

  function fillUnit(fill) {
    var match = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(String(fill));
    if (!match) return String(fill);
    return '#' + match.slice(1).map(function (channel) {
      return Math.max(0, Math.min(255, Number(channel))).toString(16).padStart(2, '0');
    }).join('');
  }

  function segmentRanges(tokens, geometryStart) {
    var result = [];
    var command = null;
    var i = 0;
    while (i < tokens.length) {
      if (/^[a-zA-Z]$/.test(tokens[i])) {
        command = tokens[i++];
        if (!Object.prototype.hasOwnProperty.call(ARITY, command.toUpperCase())) {
          throw new Error('Unsupported SVG command: ' + command);
        }
        if (command.toUpperCase() === 'Z') {
          result.push({ end: geometryStart + i, text: command });
          command = null;
          continue;
        }
      }
      if (!command) throw new Error('SVG coordinates require an initial command.');
      var count = ARITY[command.toUpperCase()];
      if (i + count > tokens.length || tokens.slice(i, i + count).some(function (token) {
        return !NUMBER.test(token);
      })) {
        throw new Error('Incomplete SVG segment: ' + command);
      }
      result.push({
        end: geometryStart + i + count,
        text: command + ' ' + tokens.slice(i, i + count).join(' ')
      });
      i += count;
      // Additional coordinate pairs after moveto are implicit lineto segments.
      if (command === 'M') command = 'L';
      else if (command === 'm') command = 'l';
    }
    return result;
  }

  function differentCandidate(token) {
    if (NUMBER.test(token)) return String(Number((Number(token) + 7).toFixed(6)));
    return token === 'C' ? 'L' : 'C';
  }

  function buildBlocks(stream) {
    var blocks = [];
    var start = 0;
    while (start < stream.length) {
      var remaining = stream.length - start;
      var candidates = stream.slice(start, start + 16);
      var validCount = candidates.length;
      while (candidates.length < 16) candidates.push('—');
      var acceptCount;
      var rejectionIndex = null;
      var bonus = null;
      var end;
      if (remaining <= 16) {
        acceptCount = remaining;
        end = stream.length;
      } else {
        acceptCount = ACCEPT_PATTERN[blocks.length % ACCEPT_PATTERN.length];
        if (acceptCount === 16) {
          bonus = stream[start + 16];
          end = start + 17;
        } else {
          rejectionIndex = acceptCount;
          candidates[rejectionIndex] = differentCandidate(stream[start + rejectionIndex]);
          end = start + acceptCount + 1;
        }
      }
      blocks.push({
        index: blocks.length,
        start: start,
        end: end,
        acceptCount: acceptCount,
        rejectionIndex: rejectionIndex,
        bonus: bonus,
        terminal: end === stream.length,
        candidates: candidates,
        validCount: validCount
      });
      start = end;
    }
    return blocks;
  }

  function buildSample(sample) {
    if (!sample || !Array.isArray(sample.paths)) throw new Error('A sample with paths is required.');
    var stream = [];
    var ranges = sample.paths.map(function (path) {
      var start = stream.length;
      var tokens = String(path.d).match(LEXEMES) || [];
      stream.push('<path>', fillUnit(path.fill));
      var geometryStart = stream.length;
      Array.prototype.push.apply(stream, tokens);
      var geometryEnd = stream.length;
      stream.push('</path>');
      return {
        start: start,
        geometryStart: geometryStart,
        geometryEnd: geometryEnd,
        end: stream.length,
        original: path.d,
        fill: path.fill,
        segments: segmentRanges(tokens, geometryStart)
      };
    });
    stream.push('<EOS>');
    return {
      stream: stream,
      ranges: ranges,
      blocks: buildBlocks(stream),
      totalUnits: stream.length
    };
  }

  function pathAt(range, committedCount) {
    var count = Math.max(0, Math.floor(Number(committedCount) || 0));
    if (count >= range.end) {
      return { d: range.original, complete: true, visible: /^[\s]*[mM]/.test(range.original) };
    }
    var segments = range.segments.filter(function (segment) { return segment.end <= count; });
    var d = segments.map(function (segment) { return segment.text; }).join(' ');
    var visible = /^[mM](?:\s|$)/.test(d);
    return { d: visible ? d : '', complete: false, visible: visible };
  }

  return { buildSample: buildSample, pathAt: pathAt };
}));
