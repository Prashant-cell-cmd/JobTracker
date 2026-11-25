import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { View } from 'react-native';

export function DashboardIllustration() {
  return (
    <View
      accessibilityLabel="Illustration of a growing job-search pipeline"
      accessibilityRole="image"
      style={{ height: 154, width: 154 }}
    >
      <Svg height="100%" viewBox="0 0 160 160" width="100%">
        <Circle cx="82" cy="82" fill="#355845" r="72" />
        <Circle cx="125" cy="37" fill="#C6F36A" opacity="0.9" r="8" />
        <Circle cx="36" cy="47" fill="#C6F36A" opacity="0.45" r="3" />
        <Path d="M20 121c18-14 40-20 62-14 18 5 30 4 54-9v44H20z" fill="#294837" />
        <Rect fill="#192D23" height="77" rx="14" transform="rotate(-7 83 77)" width="100" x="30" y="39" />
        <Rect fill="#F7F8F1" height="77" rx="14" transform="rotate(5 81 74)" width="100" x="25" y="33" />
        <Circle cx="43" cy="53" fill="#DDE9D8" r="8" />
        <Path d="M58 50h46M58 57h31" stroke="#839486" strokeLinecap="round" strokeWidth="4" />
        <Path d="M39 92h15V79H39zm22 0h15V69H61zm22 0h15V60H83zm22 0h15V48h-15z" fill="#DCE9D6" />
        <Path
          d="m43 82 22-10 15 4 22-20 12 3"
          fill="none"
          stroke="#537C53"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />
        <Circle cx="114" cy="59" fill="#C6F36A" r="4" />
        <Circle cx="119" cy="115" fill="#C6F36A" r="20" />
        <Path
          d="m110 115 6 6 12-14"
          fill="none"
          stroke="#20372C"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4"
        />
      </Svg>
    </View>
  );
}
