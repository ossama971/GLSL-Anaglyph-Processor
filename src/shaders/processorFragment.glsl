precision highp float;

uniform sampler2D imageTexture;
uniform bool gaussian;
uniform int k;
uniform float sigma;
uniform bool laplacian;
uniform int visualizationMode;
uniform bool separableGaussian;
uniform int separableK;
uniform float separableSigma;
uniform bool horizontalFlag;
uniform bool denoising;

out vec4 out_FragColor;

void swapValues(inout float a, inout float b) {
  if (a > b) {
    float temp = a;
    a = b;
    b = temp;
  }
}

float findMedian(inout float values[9]) {
  swapValues(values[0], values[1]);
  swapValues(values[1], values[2]);
  swapValues(values[0], values[1]);

  swapValues(values[3], values[4]);
  swapValues(values[4], values[5]);
  swapValues(values[3], values[4]);

  swapValues(values[6], values[7]);
  swapValues(values[7], values[8]);
  swapValues(values[6], values[7]);

  swapValues(values[0], values[3]);
  swapValues(values[3], values[6]);

  swapValues(values[5], values[8]);
  swapValues(values[2], values[8]);

  swapValues(values[1], values[4]);
  swapValues(values[4], values[7]);
  swapValues(values[1], values[4]);

  swapValues(values[2], values[6]);
  swapValues(values[4], values[6]);
  swapValues(values[2], values[4]);

  return values[4];
}

ivec2 clampPixel(ivec2 pixel, ivec2 imageSize) {
  return clamp(pixel, ivec2(0), imageSize - ivec2(1));
}

vec4 gaussianBlur2D(ivec2 pixel, ivec2 imageSize) {
  vec4 color = vec4(0.0);
  float weightedSum = 0.0;

  for (int i = -k; i <= k; i++) {
    for (int j = -k; j <= k; j++) {
      float weight = exp(-(float(i * i + j * j) / (2.0 * sigma * sigma)));
      ivec2 samplePixel = clampPixel(pixel + ivec2(i, j), imageSize);
      color += texelFetch(imageTexture, samplePixel, 0) * weight;
      weightedSum += weight;
    }
  }

  return color / weightedSum;
}

vec4 laplacianFilter(ivec2 pixel, ivec2 imageSize) {
  vec4 color = vec4(0.0, 0.0, 0.0, 1.0);

  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      float weight = 0.0;

      if (i == 0 && j == 0) {
        weight = -4.0;
      } else if ((abs(i) + abs(j)) == 1) {
        weight = 1.0;
      }

      ivec2 samplePixel = clampPixel(pixel + ivec2(i, j), imageSize);
      color += texelFetch(imageTexture, samplePixel, 0) * weight;
    }
  }

  if (visualizationMode == 0) {
    return abs(color);
  }

  return vec4(vec3(length(color.rgb)), 1.0);
}

vec4 separableGaussianBlur(ivec2 pixel, ivec2 imageSize) {
  vec4 color = vec4(0.0);
  float weightedSum = 0.0;

  for (int i = -separableK; i <= separableK; i++) {
    float weight =
      exp(-(float(i * i) / (2.0 * separableSigma * separableSigma)));
    ivec2 offset = horizontalFlag ? ivec2(i, 0) : ivec2(0, i);
    ivec2 samplePixel = clampPixel(pixel + offset, imageSize);
    color += texelFetch(imageTexture, samplePixel, 0) * weight;
    weightedSum += weight;
  }

  return color / weightedSum;
}

vec4 medianDenoise(ivec2 pixel, ivec2 imageSize) {
  float valuesR[9];
  float valuesG[9];
  float valuesB[9];
  int index = 0;

  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      ivec2 samplePixel = clampPixel(pixel + ivec2(i, j), imageSize);
      vec4 sampleColor = texelFetch(imageTexture, samplePixel, 0);
      valuesR[index] = sampleColor.r;
      valuesG[index] = sampleColor.g;
      valuesB[index] = sampleColor.b;
      index++;
    }
  }

  return vec4(
    findMedian(valuesR),
    findMedian(valuesG),
    findMedian(valuesB),
    1.0
  );
}

void main(void) {
  ivec2 pixel = ivec2(int(gl_FragCoord.x), int(gl_FragCoord.y));
  ivec2 imageSize = textureSize(imageTexture, 0);

  if (gaussian) {
    out_FragColor = gaussianBlur2D(pixel, imageSize);
  } else if (laplacian) {
    out_FragColor = laplacianFilter(pixel, imageSize);
  } else if (separableGaussian) {
    out_FragColor = separableGaussianBlur(pixel, imageSize);
  } else if (denoising) {
    out_FragColor = medianDenoise(pixel, imageSize);
  } else {
    out_FragColor = texelFetch(imageTexture, pixel, 0);
  }
}
