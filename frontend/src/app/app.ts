import { Component, inject, signal, computed, OnInit,} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ContactService, Contact, Department } from './contact.service';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})



export class AppComponent implements OnInit {
  contactService = inject(ContactService);

  searchTerm = signal<string>('');
  showLoginModal = signal<boolean>(false);
  isEditing = signal<boolean>(false);
  selectedFile: File | null = null;
  
  allContacts = signal<Contact[]>([]);
  allDepartments = signal<Department[]>([]);
  selectedDepartment = signal<string>('');

  loginData = { username: '', password: '' };
  
  // 💡 नवीन ५ फील्ड्स फॉर्म स्टेटमध्ये समाविष्ट
  contactForm = signal<Contact>({
     department_name: '',designation: '', address: '', name: '', mobile_number: '', telephone_number: '', email: '',
    other_contact_1: '', other_contact_2: '', other_contact_3: '', other_contact_4: ''
  });

  newDepartmentName = signal<string>('');

  departmentsList = computed(() => {
    return this.allDepartments().map(d => d.name).sort();
  });


filteredContacts = computed(() => {
  // 💡 जर कोणताही विभाग निवडलेला नसेल (रिकामी स्ट्रिंग असेल), तर थेट रिकामा अ‍ॅरे [] पाठवा, संपर्क दाखवू नका.
  if (!this.selectedDepartment()) {
    return [];
  }

  let contacts = this.allContacts();

  // एक्सेलच्या मूळ क्रमानुसार दाखवण्यासाठी ID नुसार सॉर्टिंग
  contacts = [...contacts].sort((a, b) => {
    return (a.id || 0) - (b.id || 0);
  });

  // निवडलेल्या विभागानुसार फिल्टर करणे
  contacts = contacts.filter(c => c.department_name === this.selectedDepartment());

  // सर्च बारनुसार फिल्टर करणे
  const search = this.searchTerm().toLowerCase().trim();
  if (search) {
    contacts = contacts.filter(c => 
      c.name.toLowerCase().includes(search) ||
      (c.designation && c.designation.toLowerCase().includes(search)) ||
      c.mobile_number.includes(search) ||
      (c.telephone_number && c.telephone_number.includes(search))
    );
  }

  return contacts;
});

  ngOnInit() {
    this.loadContacts();
    this.loadDepartments();
  }
  
  loadContacts() {
    this.contactService.getContacts().subscribe({
      next: (data) => this.allContacts.set(data),
      error: (err) => console.error(err)
    });
  }

  loadDepartments() {
    this.contactService.getDepartments().subscribe({
      next: (data) => this.allDepartments.set(data),
      error: (err) => console.error(err)
    });
  }

  copyToClipboard(value: string | undefined) {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      alert(`Copied / कॉपी केले: ${value}`);
    }).catch(err => console.error('Could not copy text: ', err));
  }

  onLogin() {
    this.contactService.login(this.loginData).subscribe({
      next: () => {
        this.showLoginModal.set(false);
        this.loginData = { username: '', password: '' };
        this.loadDepartments();
      },
      error: () => alert('Invalid credentials!')
    });
  }

  onAddDepartment() {
    const deptName = this.newDepartmentName().trim();
    if (!deptName) return alert('Enter a valid department name');

    this.contactService.saveDepartment({ name: deptName }).subscribe({
      next: (res) => {
        alert(res.message || 'Department Added successfully!');
        this.newDepartmentName.set('');
        this.loadDepartments();
      },
      error: (err) => {
        alert(err.error?.message || 'Error creating unique department parameter.');
      }
    });
  }

  deleteDepartment(id: number) {
  if (confirm('तुम्हाला खात्री आहे का की तुम्ही हे डिपार्टमेंट डिलीट करू इच्छिता?')) {
    this.contactService.deleteDepartment(id).subscribe({
      next: (res) => {
        alert(res.message);
        this.loadDepartments();
      },
      error: (err) => {
        alert(err.error?.error || 'डिपार्टमेंट डिलीट करता आले नाही!');
      }
    });
  }
}

onSaveContact() {
  const currentForm = this.contactForm();
  
  // व्हॅलिडेशन: नाव, मोबाईल आणि डिपार्टमेंट अनिवार्य आहेत
  if (!currentForm.name || !currentForm.mobile_number || !currentForm.department_name) {
    alert('Please fill all required fields (Name, Mobile, and Department)!');
    return;
  }

this.contactService.saveContact(currentForm).subscribe({
  next: (res: any) => {
    alert(this.isEditing() ? 'संपर्क यशस्वीरित्या अद्ययावत केला गेला आहे!' : 'नवीन संपर्क यशस्वीरित्या जतन केला गेला आहे!');
    
    // १. सर्व संपर्क डेटाबेसमधून पुन्हा ताजे लोड करा
    this.contactService.getContacts().subscribe({
      next: (data) => {
        // २. नवीन आयडीसह डेटा सेव्ह झाल्याची खात्री करून सिग्नल्स अपडेट करा
        this.allContacts.set(data);
        this.resetForm();
      },
      error: () => this.loadContacts() // बॅकअप म्हणून जुने फंक्शन
    });
  },
  error: (err) => {
    console.error(err);
    alert('संपर्क सेव्ह करताना काहीतरी त्रुटी आली!');
  }
});

}

  onEditContact(contact: Contact) {
    this.isEditing.set(true);
    this.contactForm.set({ ...contact });
  }

  onDeleteContact(id: number | undefined) {
    if (id && confirm('Are you sure you want to delete this contact?')) {
      this.contactService.deleteContact(id).subscribe(() => {
        this.loadContacts();
      });
    }
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
    }
  }

exportData(type: 'excel' | 'csv') {
  // १. हेडर्स व्याख्या
  const headers = [
    'Department', 'Designation', 'Office Address', "Officer's Name", 'Mobile Number', 
    'Office Telephone Number', 'Official Email Id', 'Other Contact'
  ];

  // २. डेटा मॅपिंग - XLSX च्या विशिष्ट फॉरमॅटनुसार (Cell Object Format)
  // { v: value, t: 's' } चा अर्थ 't: s' म्हणजे Type: String (यामुळे सुरुवातीचा 0 कट होत नाही)
  const rows = this.filteredContacts().map(contact => [
    { v: contact.department_name || '-', t: 's' },
    { v: contact.designation || '-', t: 's' },
    { v: contact.address || '-', t: 's' },
    { v: contact.name || '', t: 's' },
    { v: contact.mobile_number || '', t: 's' }, // मोबाईलचा 0 सुरक्षित राहील
    { v: contact.telephone_number || '-', t: 's' }, // टेलिफोनचा 0 सुरक्षित राहील
    { v: contact.email || '-', t: 's' },
    { v: contact.other_contact_1 || '-', t: 's' } // इतर संपर्काचा 0 सुरक्षित राहील
  ]);

  // ३. वर्कशीट तयार करताना आधीच्या फॉरमॅटचा वापर करणे
  const worksheet = XLSX.utils.aoa_to_sheet([
    headers.map(h => ({ v: h, t: 's' })), // हेडर्स देखील टेक्स्ट म्हणून
    ...rows
  ]);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Contacts');

  if (type === 'excel') {
    XLSX.writeFile(workbook, 'contacts_directory.xlsx');
  } else {
    // CSV साठी देखील स्ट्रिंग फॉरमॅट टिकवून ठेवण्यासाठी पर्याय
    XLSX.writeFile(workbook, 'contacts_directory.csv', { bookType: 'csv' });
  }
}

  

onUploadFile() {
  if (!this.selectedFile) {
    alert('Please select a file first.');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e: any) => {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    // raw: true मुळे xlsx लायब्ररी डेटा जसा आहे तसा वाचेल
    const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true });

    if (jsonData.length <= 1) {
      alert('The uploaded file is empty or contains no data rows.');
      return;
    }

    const validContactsToUpload: any[] = [];
    const errors: string[] = [];

    // पहिली ओळ हेडरची सोडून डेटा वाचणे
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (!row || row.length === 0) continue;

      const departmentName = row[0] ? String(row[0]).trim() || '' : '';
      const designation = row[1] ? String(row[1]).trim() : '-';
      const address = row[2] ? String(row[2]).trim() : '-';
      const name = row[3] ? String(row[3]).trim() : '';
      
      
      let mobile = row[4] ? String(row[4]).trim() : '';


      // टेलिफोन नंबर आणि शून्याची दुरुस्ती
      let telephone = row[5] ? String(row[5]).trim() : '-';
      if (telephone !== '-' && telephone.length > 0 && !telephone.startsWith('0') && telephone.length <= 10) {
        telephone = '0' + telephone;
      }

      const email = row[6] ? String(row[6]).trim() : '-';

      // Other Contact 1 आणि शून्याची दुरुस्ती
      let o1 = row[7] ? String(row[7]).trim() : '-';
      if (o1 !== '-' && o1.length === 10 && !o1.startsWith('0')) {
        o1 = '0' + o1;
      }

      // व्हॅलिडेशन नियम
      if (!departmentName) {
        errors.push(`Row ${i + 1}: Department name is missing.`);
        continue;
      }
      if (!this.departmentsList().includes(departmentName)) {
        errors.push(`Row ${i + 1}: Department '${departmentName}' does not exist.`);
        continue;
      }
      if (!name) {
        errors.push(`Row ${i + 1}: Officer's Name is missing.`);
        continue;
      }
      if (!mobile) {
        errors.push(`Row ${i + 1}: Mobile number is missing.`);
        continue;
      }

      // बॅकएंडला पाठवताना २, ३, ४ ची व्हॅल्यू explicit null ठेवणे
      validContactsToUpload.push({          
        designation: designation,
        department_name: departmentName,
        address: address,
        name: name,
        mobile_number: mobile,
        telephone_number: telephone,
        email: email,
        other_contact_1: o1,
        other_contact_2: null, // 👈 UI वरून काढून टाकल्यामुळे null पाठवले
        other_contact_3: null, // 👈 null पाठवले
        other_contact_4: null  // 👈 null पाठवले
      });
    }

    if (errors.length > 0) {
      console.error('Import Errors:', errors);
      alert(`Import Failed!\\n\\n${errors.slice(0, 3).join('\\n')}\\n...and ${errors.length - 3} more errors.`);
      return;
    }

    if (validContactsToUpload.length > 0) {
      this.contactService.bulkImportContacts(validContactsToUpload).subscribe({
        next: () => {
          alert(`Success! ${validContactsToUpload.length} records imported successfully.`);
          this.loadContacts();
          this.selectedFile = null;
        },
        error: () => alert('Backend service error during bulk import.')
      });
    }
  };
  reader.readAsArrayBuffer(this.selectedFile);
}  

  resetForm() {
    this.isEditing.set(false);
    this.contactForm.set({
      department_name: '', designation: '', name: '',  mobile_number: '', telephone_number: '',
      email: '',other_contact_1: '', other_contact_2: '', other_contact_3: '', other_contact_4: ''
    });
  }
}