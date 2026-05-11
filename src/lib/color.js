export const rgbToHex = (r, g, b) => "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
export const hexToRgb = (hex) => {
  const bigint = parseInt(hex.slice(1), 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
};

export const ColorSpaceConverter = {
    srgb: {
        to: (r, g, b) => [r, g, b],
        from: (v0, v1, v2) => [v0, v1, v2]
    },
    linear: {
        to: (r, g, b) => {
            const f = c => { c/=255; return c <= 0.04045 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); };
            return [f(r), f(g), f(b)];
        },
        from: (v0, v1, v2) => {
            const f = c => {
                if (c <= 0) return 0;
                if (c >= 1) return 255;
                return (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1/2.4) - 0.055) * 255;
            };
            return [f(v0), f(v1), f(v2)];
        }
    },
    oklab: {
        to: (r, g, b) => {
            const [lr, lg, lb] = ColorSpaceConverter.linear.to(r, g, b);
            const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
            const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073970337 * lb;
            const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
            const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
            return [
                0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720456 * s_,
                1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
                0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
            ];
        },
        from: (L, a, b) => {
            const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
            const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
            const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
            const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
            const lr =  4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
            const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
            const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
            return ColorSpaceConverter.linear.from(lr, lg, lb);
        }
    },
    lab: {
        to: (r, g, b) => {
            const [R, G, B] = ColorSpaceConverter.linear.to(r, g, b);
            let X = R * 0.4124 + G * 0.3576 + B * 0.1805;
            let Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
            let Z = R * 0.0193 + G * 0.1192 + B * 0.9505;
            X /= 0.95047; Y /= 1.00000; Z /= 1.08883;
            X = X > 0.008856 ? Math.pow(X, 1/3) : 7.787 * X + 16/116;
            Y = Y > 0.008856 ? Math.pow(Y, 1/3) : 7.787 * Y + 16/116;
            Z = Z > 0.008856 ? Math.pow(Z, 1/3) : 7.787 * Z + 16/116;
            return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
        },
        from: (L, a, b) => {
            let y = (L + 16) / 116;
            let x = a / 500 + y;
            let z = y - b / 200;
            const y3 = y * y * y, x3 = x * x * x, z3 = z * z * z;
            y = y3 > 0.008856 ? y3 : (y - 16/116) / 7.787;
            x = x3 > 0.008856 ? x3 : (x - 16/116) / 7.787;
            z = z3 > 0.008856 ? z3 : (z - 16/116) / 7.787;
            x *= 0.95047; y *= 1.00000; z *= 1.08883;
            const lr = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
            const lg = x * -0.9692660 + y * 1.8760108 + z * 0.0415560;
            const lb = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;
            return ColorSpaceConverter.linear.from(lr, lg, lb);
        }
    },
    yuv: {
        to: (r, g, b) => [
            0.299 * r + 0.587 * g + 0.114 * b,
            -0.14713 * r - 0.28886 * g + 0.436 * b,
            0.615 * r - 0.51499 * g - 0.10001 * b
        ],
        from: (y, u, v) => [
            y + 1.13983 * v,
            y - 0.39465 * u - 0.58060 * v,
            y + 2.03211 * u
        ]
    }
};

export const SPACE_SCALES = { srgb: 255, linear: 1, oklab: 1, lab: 100, yuv: 255 };
