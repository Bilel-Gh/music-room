import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Switch,
  Keyboard,
  Platform,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import api from '../services/api';
import { crossAlert } from '../utils/alert';
import { useTheme } from '../theme/theme-context';
import { useResponsive } from '../hooks/use-responsive';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateEvent'>;

type LicenseType = 'OPEN' | 'INVITE_ONLY' | 'LOCATION_TIME';

export default function CreateEventScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { formMaxWidth } = useResponsive();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [licenseType, setLicenseType] = useState<LicenseType>('OPEN');
  const [city, setCity] = useState('');
  const [geocoding, setGeocoding] = useState(false);
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date(Date.now() + 3600_000 * 3));
  const [creating, setCreating] = useState(false);

  // Picker visibility (Android shows modals, iOS inline)
  const [showStartDate, setShowStartDate] = useState(false);
  const [showStartTime, setShowStartTime] = useState(false);
  const [showEndDate, setShowEndDate] = useState(false);
  const [showEndTime, setShowEndTime] = useState(false);

  const handleLicenseChange = (type: LicenseType) => {
    setLicenseType(type);
  };

  const formatDate = (d: Date) =>
    d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  const formatTime = (d: Date) =>
    d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  const handleCreate = async () => {
    if (!name.trim() || name.trim().length < 2) {
      crossAlert('Erreur', 'Le nom doit faire au moins 2 caracteres');
      return;
    }

    Keyboard.dismiss();
    setCreating(true);

    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        isPublic,
        licenseType,
      };

      if (description.trim()) {
        payload.description = description.trim();
      }

      if (licenseType === 'LOCATION_TIME') {
        if (!city.trim()) {
          crossAlert('Erreur', 'Veuillez saisir une ville');
          setCreating(false);
          return;
        }

        // Geocode the city to get coordinates
        setGeocoding(true);
        let lat: number | null = null;
        let lon: number | null = null;

        if (Platform.OS === 'web') {
          // expo-location geocoding doesn't work on web, use Nominatim
          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city.trim())}&format=json&limit=1`
            );
            const json = await res.json();
            if (json.length > 0) {
              lat = parseFloat(json[0].lat);
              lon = parseFloat(json[0].lon);
            }
          } catch {
            // fallback failed
          }
        } else {
          const results = await Location.geocodeAsync(city.trim());
          if (results.length > 0) {
            lat = results[0].latitude;
            lon = results[0].longitude;
          }
        }
        setGeocoding(false);

        if (lat === null || lon === null) {
          crossAlert('Erreur', `Impossible de trouver "${city.trim()}". Essayez avec un nom de ville plus precis.`);
          setCreating(false);
          return;
        }

        payload.latitude = lat;
        payload.longitude = lon;
        payload.startTime = startDate.toISOString();
        payload.endTime = endDate.toISOString();
      }

      const { data } = await api.post('/events', payload);
      navigation.replace('Event', { eventId: data.data.id });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error
        || 'Impossible de creer l\'evenement';
      crossAlert('Erreur', msg);
    } finally {
      setCreating(false);
      setGeocoding(false);
    }
  };

  const onStartDateChange = (_: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowStartDate(false);
    if (date) setStartDate(date);
  };

  const onStartTimeChange = (_: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowStartTime(false);
    if (date) setStartDate(date);
  };

  const onEndDateChange = (_: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowEndDate(false);
    if (date) setEndDate(date);
  };

  const onEndTimeChange = (_: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setShowEndTime(false);
    if (date) setEndDate(date);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.scroll, formMaxWidth ? { maxWidth: formMaxWidth, width: '100%', alignSelf: 'center' as const } : undefined]} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>Nom *</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Nom de l'evenement"
        placeholderTextColor="#999"
      />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="Description (optionnel)"
        placeholderTextColor="#999"
        multiline
      />

      <Text style={styles.label}>Type de licence</Text>
      <View style={styles.licenseRow}>
        {(['OPEN', 'INVITE_ONLY', 'LOCATION_TIME'] as LicenseType[]).map((type) => (
          <TouchableOpacity
            key={type}
            style={[styles.licenseBtn, licenseType === type && { borderColor: colors.primary, backgroundColor: colors.primaryLight }]}
            onPress={() => handleLicenseChange(type)}
          >
            <Text style={[styles.licenseBtnText, licenseType === type && { color: colors.primary, fontWeight: '600' as const }]}>
              {type === 'OPEN' ? 'Ouvert' : type === 'INVITE_ONLY' ? 'Sur invitation' : 'Lieu + Horaire'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.licenseHint}>
        {licenseType === 'OPEN' && 'Tout le monde peut participer et voter'}
        {licenseType === 'INVITE_ONLY' && 'Seuls les invites peuvent voter et ajouter des tracks'}
        {licenseType === 'LOCATION_TIME' && 'Les votes sont limites a une zone geographique et un creneau horaire'}
      </Text>

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Visible publiquement</Text>
        <Switch
          value={isPublic}
          onValueChange={setIsPublic}
          trackColor={{ true: colors.primary, false: '#ddd' }}
        />
      </View>
      <Text style={styles.visibilityHint}>
        {isPublic
          ? 'Visible par tous dans la liste d\'accueil'
          : 'Cache — seuls les invites peuvent y acceder'}
      </Text>

      {licenseType === 'LOCATION_TIME' && (
        <View style={styles.locationSection}>
          <Text style={styles.sectionTitle}>Lieu</Text>
          <TextInput
            style={styles.input}
            value={city}
            onChangeText={setCity}
            placeholder="Paris, Lyon, Marseille..."
            placeholderTextColor="#999"
          />
          {geocoding && (
            <View style={styles.geocodingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.geocodingText}>Recherche de la ville...</Text>
            </View>
          )}
          <Text style={styles.hintText}>
            Les votants devront se trouver dans un rayon de 5 km autour de cette ville
          </Text>

          <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Creneau horaire</Text>

          {/* Start date */}
          <Text style={styles.smallLabel}>Debut</Text>
          <View style={styles.pickerRow}>
            <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowStartDate(true)}>
              <Text style={styles.pickerBtnText}>{formatDate(startDate)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowStartTime(true)}>
              <Text style={styles.pickerBtnText}>{formatTime(startDate)}</Text>
            </TouchableOpacity>
          </View>
          {showStartDate && (
            <DateTimePicker
              value={startDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onStartDateChange}
              minimumDate={new Date()}
            />
          )}
          {showStartTime && (
            <DateTimePicker
              value={startDate}
              mode="time"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onStartTimeChange}
              is24Hour
            />
          )}

          {/* End date */}
          <Text style={styles.smallLabel}>Fin</Text>
          <View style={styles.pickerRow}>
            <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowEndDate(true)}>
              <Text style={styles.pickerBtnText}>{formatDate(endDate)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowEndTime(true)}>
              <Text style={styles.pickerBtnText}>{formatTime(endDate)}</Text>
            </TouchableOpacity>
          </View>
          {showEndDate && (
            <DateTimePicker
              value={endDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onEndDateChange}
              minimumDate={startDate}
            />
          )}
          {showEndTime && (
            <DateTimePicker
              value={endDate}
              mode="time"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onEndTimeChange}
              is24Hour
            />
          )}
        </View>
      )}

      <TouchableOpacity
        style={[styles.createBtn, { backgroundColor: colors.primary }, creating && styles.btnDisabled]}
        onPress={handleCreate}
        disabled={creating}
      >
        {creating ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.createBtnText}>Creer l'evenement</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#444',
    marginBottom: 6,
    marginTop: 14,
  },
  smallLabel: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#1a1a1a',
  },
  multiline: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 8,
  },
  switchLabel: {
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
  },
  licenseRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  licenseBtn: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  licenseBtnActive: {},
  licenseBtnText: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
    textAlign: 'center',
  },
  licenseBtnTextActive: {},
  licenseHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 6,
    fontStyle: 'italic',
  },
  visibilityHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
    fontStyle: 'italic',
  },
  locationSection: {
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  hintText: {
    fontSize: 12,
    color: '#999',
    marginTop: 6,
    fontStyle: 'italic',
  },
  geocodingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  geocodingText: {
    fontSize: 13,
    color: '#666',
  },
  pickerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pickerBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#fafafa',
    alignItems: 'center',
  },
  pickerBtnText: {
    fontSize: 15,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  createBtn: {
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 28,
  },
  btnDisabled: {
    opacity: 0.7,
  },
  createBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
