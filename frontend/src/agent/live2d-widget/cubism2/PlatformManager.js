/* global Image, Live2DModelWebGL, document, fetch, Live2D */
/**
 *
 *  You can modify and use this source freely
 *  only for the development of application related Live2D.
 *
 *  (c) Live2D Inc. All rights reserved.
 */

import logger from '../../utils/logger';
//============================================================
//============================================================
//  class PlatformManager     extend IPlatformManager
//============================================================
//============================================================
class PlatformManager {
  constructor() {
    this.cache = {};
  }
  //============================================================
  //    PlatformManager # loadBytes()
  //============================================================
  loadBytes(path /*String*/, callback) {
    if (path in this.cache) {
      return callback(this.cache[path]);
    }
    fetch(path)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP_${response.status}_${response.statusText || 'ERROR'}`);
        }
        return response.arrayBuffer();
      })
      .then((arrayBuffer) => {
        this.cache[path] = arrayBuffer;
        callback(arrayBuffer);
      })
      .catch((e) => {
        logger.error('Failed to load bytes : ' + path, e);
        callback(new ArrayBuffer(0));
      });
  }

  //============================================================
  //    PlatformManager # loadLive2DModel()
  //============================================================
  loadLive2DModel(path /*String*/, callback) {
    let model = null;

    // load moc
    this.loadBytes(path, (buf) => {
      try {
        model = Live2DModelWebGL.loadModel(buf);
      } catch (e) {
        logger.error('Failed to parse Live2D model bytes : ' + path, e);
        model = null;
      } finally {
        callback(model);
      }
    });
  }

  //============================================================
  //    PlatformManager # loadTexture()
  //============================================================
  loadTexture(model /*ALive2DModel*/, no /*int*/, path /*String*/, callback) {
    const loadedImage = new Image();
    loadedImage.crossOrigin = 'anonymous';
    loadedImage.src = path;

    loadedImage.onload = () => {
      let gl = null;

      if (typeof Live2D !== 'undefined' && typeof Live2D.getGL === 'function') {
        gl = Live2D.getGL(0);
      }

      if (!gl) {
        const canvas = document.getElementById('live2d');
        if (!canvas) {
          logger.error('Failed to find live2d canvas when loading texture: ' + path);
          if (typeof callback == 'function') callback();
          return;
        }
        gl =
          canvas.getContext('webgl2', {
            premultipliedAlpha: true,
            preserveDrawingBuffer: true
          }) ||
          canvas.getContext('webgl', {
            premultipliedAlpha: true,
            preserveDrawingBuffer: true
          }) ||
          canvas.getContext('experimental-webgl', {
            premultipliedAlpha: true,
            preserveDrawingBuffer: true
          });

        if (!gl) {
          logger.error('Failed to get WebGL context for texture: ' + path);
          if (typeof callback == 'function') callback();
          return;
        }

        if (typeof Live2D !== 'undefined' && typeof Live2D.setGL === 'function') {
          Live2D.setGL(gl);
        }
      }

      let texture = gl.createTexture();
      if (!texture) {
        logger.error('Failed to generate gl texture name.');
        if (typeof callback == 'function') callback();
        return;
      }

      if (model.isPremultipliedAlpha() == false) {
        // 乗算済アルファテクスチャ以外の場合
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
      }
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, loadedImage);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
      gl.generateMipmap(gl.TEXTURE_2D);

      model.setTexture(no, texture);

      // テクスチャオブジェクトを解放
      texture = null;

      if (typeof callback == 'function') callback();
    };

    loadedImage.onerror = () => {
      logger.error('Failed to load image : ' + path);
      let gl = null;

      if (typeof Live2D !== 'undefined' && typeof Live2D.getGL === 'function') {
        gl = Live2D.getGL(0);
      }

      if (!gl) {
        const canvas = document.getElementById('live2d');
        gl =
          canvas?.getContext('webgl2', { premultipliedAlpha: true, preserveDrawingBuffer: true }) ||
          canvas?.getContext('webgl', { premultipliedAlpha: true, preserveDrawingBuffer: true }) ||
          canvas?.getContext('experimental-webgl', {
            premultipliedAlpha: true,
            preserveDrawingBuffer: true
          });

        if (gl && typeof Live2D !== 'undefined' && typeof Live2D.setGL === 'function') {
          Live2D.setGL(gl);
        }
      }

      try {
        if (gl) {
          const texture = gl.createTexture();
          if (texture) {
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(
              gl.TEXTURE_2D,
              0,
              gl.RGBA,
              1,
              1,
              0,
              gl.RGBA,
              gl.UNSIGNED_BYTE,
              new Uint8Array([0, 0, 0, 0])
            );
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            model.setTexture(no, texture);
          }
        }
      } catch (e) {
        logger.error('Failed to apply fallback texture : ' + path, e);
      } finally {
        if (typeof callback == 'function') callback();
      }
    };
  }

  //============================================================
  //    PlatformManager # parseFromBytes(buf)

  //============================================================
  jsonParseFromBytes(buf) {
    let jsonStr;

    const bomCode = new Uint8Array(buf, 0, 3);
    if (bomCode[0] == 239 && bomCode[1] == 187 && bomCode[2] == 191) {
      jsonStr = String.fromCharCode.apply(null, new Uint8Array(buf, 3));
    } else {
      jsonStr = String.fromCharCode.apply(null, new Uint8Array(buf));
    }

    const jsonObj = JSON.parse(jsonStr);

    return jsonObj;
  }
}

export default PlatformManager;
