precision highp float;

uniform sampler2D leftTexture;
uniform sampler2D rightTexture;
uniform bool trueAnaglyph;
uniform bool grayAnaglyph;
uniform bool colorAnaglyph;
uniform bool halfColorAnaglyph;
uniform bool optimizedAnaglyph;
    
out vec4 out_FragColor;

void main(void) {
    ivec2 pixel = ivec2(int(gl_FragCoord.x), int(gl_FragCoord.y));
    ivec2 imageSize = textureSize(leftTexture, 0);
    ivec2 leftPixel = clamp(pixel - ivec2(4, 0), ivec2(0), imageSize - ivec2(1));
    ivec2 rightPixel = clamp(pixel + ivec2(4, 0), ivec2(0), imageSize - ivec2(1));
    vec4 leftColor = texelFetch(leftTexture, leftPixel, 0);
    vec4 rightColor = texelFetch(rightTexture, rightPixel, 0);

    mat3 leftM;
    mat3 rightM;
    
    if (trueAnaglyph) {
        leftM = mat3(
            0.299, 0.0, 0.0,
            0.587, 0.0, 0.0,
            0.114, 0.0, 0.0
        );
        rightM = mat3(
            0.0, 0.0, 0.299,
            0.0, 0.0, 0.587,
            0.0, 0.0, 0.114
        );
     
    
    
    out_FragColor = vec4(leftM * leftColor.rgb + rightM * rightColor.rgb, 1.0);
    } else if (grayAnaglyph) {
        leftM = mat3(
            0.299, 0.0, 0.0,
            0.587, 0.0, 0.0,
            0.114, 0.0, 0.0
        );
        rightM = mat3(
            0.0, 0.299, 0.299,
            0.0, 0.587, 0.587,
            0.0, 0.114, 0.114
        );
        out_FragColor = vec4(leftM * leftColor.rgb + rightM * rightColor.rgb, 1.0);
    
    } else if(colorAnaglyph) {
        leftM = mat3(
            1.0, 0.0, 0.0,
            0.0, 0.0, 0.0,
            0.0, 0.0, 0.0
        );
        rightM = mat3(
            0.0, 0.0, 0.0,
            0.0, 1.0, 0.0,
            0.0, 0.0, 1.0
        );
        out_FragColor = vec4(leftM * leftColor.rgb + rightM * rightColor.rgb, 1.0);

    } else if(halfColorAnaglyph) {
        leftM = mat3(
            0.299, 0.0, 0.0,
            0.587, 0.0, 0.0,
            0.114, 0.0, 0.0
        );
        rightM = mat3(
            0.0, 0.0, 0.0,
            0.0, 1.0, 0.0,
            0.0, 0.0, 1.0
        );
        out_FragColor = vec4(leftM * leftColor.rgb + rightM * rightColor.rgb, 1.0);
    } else if(optimizedAnaglyph) {
        // Dubois least-squares projection (red/cyan glasses)
        leftM = mat3(
             0.437, -0.062, -0.048,
             0.449, -0.062, -0.050,
             0.164, -0.024, -0.017
        );
        rightM = mat3(
            -0.011,  0.377, -0.026,
            -0.032,  0.761, -0.093,
            -0.007,  0.009,  1.234
        );
        out_FragColor = vec4(clamp(leftM * leftColor.rgb + rightM * rightColor.rgb, 0.0, 1.0), 1.0);
    } else {        
        out_FragColor = vec4(leftColor.r, leftColor.g, leftColor.b, 1.0);
    }
}